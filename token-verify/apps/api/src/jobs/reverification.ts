// Token Identity Verification - Re-verification Background Job
// Periodically re-checks verified tokens to ensure proofs are still valid

import { VerificationStatus, ReverificationStatus, AuditActor } from '@prisma/client';
import { PROOF_CONSTANTS, AUDIT_ACTIONS, VerificationTier } from '@token-verify/shared';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runVerificationChecks, revokeVerification } from '../services/verification-orchestrator.js';
import { logAuditEvent } from '../services/audit-logger.js';

/**
 * Schedule re-verification jobs for all verified tokens
 * Should be called periodically (e.g., daily via cron)
 */
export async function scheduleReverificationJobs(): Promise<void> {
  logger.info('Scheduling re-verification jobs');

  // Find all tokens with approved verification
  const verifiedTokens = await db.token.findMany({
    where: {
      verificationRequests: {
        some: { status: VerificationStatus.APPROVED },
      },
    },
    include: {
      verificationRequests: {
        where: { status: VerificationStatus.APPROVED },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const now = new Date();
  let scheduled = 0;

  for (const token of verifiedTokens) {
    // Check if there's already a scheduled job
    const existingJob = await db.reverificationJob.findFirst({
      where: {
        tokenId: token.id,
        status: { in: [ReverificationStatus.SCHEDULED, ReverificationStatus.IN_PROGRESS] },
      },
    });

    if (existingJob) {
      continue;
    }

    // Check last successful re-verification
    const lastJob = await db.reverificationJob.findFirst({
      where: {
        tokenId: token.id,
        status: ReverificationStatus.PASSED,
      },
      orderBy: { completedAt: 'desc' },
    });

    // Schedule if never re-verified or last check was > PROOF_MAX_AGE_DAYS ago
    const shouldSchedule =
      !lastJob ||
      !lastJob.completedAt ||
      (now.getTime() - lastJob.completedAt.getTime()) / (1000 * 60 * 60 * 24) >
        PROOF_CONSTANTS.PROOF_MAX_AGE_DAYS;

    if (shouldSchedule) {
      await db.reverificationJob.create({
        data: {
          tokenId: token.id,
          status: ReverificationStatus.SCHEDULED,
          scheduledAt: now,
        },
      });
      scheduled++;

      await logAuditEvent({
        actor: AuditActor.SYSTEM,
        action: AUDIT_ACTIONS.REVERIFICATION_SCHEDULED,
        targetType: 'token',
        targetId: token.id,
        metadata: { lastJobCompletedAt: lastJob?.completedAt?.toISOString() },
      });
    }
  }

  logger.info({ scheduled }, 'Re-verification jobs scheduled');
}

/**
 * Process scheduled re-verification jobs
 * Should be called periodically (e.g., every hour via cron)
 */
export async function processReverificationJobs(): Promise<void> {
  logger.info('Processing re-verification jobs');

  const jobs = await db.reverificationJob.findMany({
    where: {
      status: ReverificationStatus.SCHEDULED,
      scheduledAt: { lte: new Date() },
    },
    take: 10, // Process in batches
    orderBy: { scheduledAt: 'asc' },
  });

  for (const job of jobs) {
    try {
      // Mark as in progress
      await db.reverificationJob.update({
        where: { id: job.id },
        data: {
          status: ReverificationStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });

      // Get the verification request
      const verificationRequest = await db.verificationRequest.findFirst({
        where: {
          tokenId: job.tokenId,
          status: VerificationStatus.APPROVED,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!verificationRequest) {
        logger.warn({ jobId: job.id, tokenId: job.tokenId }, 'No approved verification request found');
        await db.reverificationJob.update({
          where: { id: job.id },
          data: {
            status: ReverificationStatus.FAILED,
            completedAt: new Date(),
            results: { error: 'No approved verification request found' },
          },
        });
        continue;
      }

      // Run verification checks
      const { tier, proofResults } = await runVerificationChecks(verificationRequest.id);

      const passed =
        tier === VerificationTier.VERIFIED || tier === VerificationTier.DEPLOYER_VERIFIED;

      // Update job status
      const newFailCount = passed ? 0 : job.failCount + 1;
      const now = new Date();
      const newStatus = passed
        ? ReverificationStatus.PASSED
        : newFailCount >= PROOF_CONSTANTS.MAX_CONSECUTIVE_FAILURES
        ? ReverificationStatus.FAILED
        : ReverificationStatus.GRACE_PERIOD;

      await db.reverificationJob.update({
        where: { id: job.id },
        data: {
          status: newStatus,
          completedAt: now,
          results: { tier, proofResults },
          failCount: newFailCount,
        },
      });

      // Update Token's reverification status fields (Milestone 2)
      const graceUntil = new Date(now);
      graceUntil.setDate(graceUntil.getDate() + PROOF_CONSTANTS.GRACE_PERIOD_DAYS);

      let tokenReverifyStatus: string;
      if (passed) {
        tokenReverifyStatus = 'ok';
      } else if (newStatus === ReverificationStatus.FAILED) {
        tokenReverifyStatus = 'revoked';
      } else {
        tokenReverifyStatus = newFailCount === 1 ? 'grace' : 'failing';
      }

      await db.token.update({
        where: { id: job.tokenId },
        data: {
          lastReverifiedAt: now,
          reverifyFailCount: newFailCount,
          reverifyStatus: tokenReverifyStatus,
          reverifyGraceUntil: tokenReverifyStatus === 'grace' ? graceUntil : null,
        },
      });

      await logAuditEvent({
        actor: AuditActor.SYSTEM,
        action: passed ? AUDIT_ACTIONS.REVERIFICATION_PASSED : AUDIT_ACTIONS.REVERIFICATION_FAILED,
        targetType: 'token',
        targetId: job.tokenId,
        metadata: { tier, proofResults, failCount: newFailCount, reverifyStatus: tokenReverifyStatus },
      });

      // Handle failures
      if (newStatus === ReverificationStatus.FAILED) {
        // Max failures reached - revoke verification
        await revokeVerification(
          verificationRequest.id,
          `Automatic revocation: Re-verification failed ${PROOF_CONSTANTS.MAX_CONSECUTIVE_FAILURES} consecutive times`
        );

        logger.warn(
          { tokenId: job.tokenId, failCount: newFailCount },
          'Token verification revoked due to failed re-verification'
        );
      } else if (newStatus === ReverificationStatus.GRACE_PERIOD) {
        // In grace period - schedule next check sooner
        const nextCheck = new Date();
        nextCheck.setDate(nextCheck.getDate() + 1); // Check again in 1 day

        await db.reverificationJob.create({
          data: {
            tokenId: job.tokenId,
            status: ReverificationStatus.SCHEDULED,
            scheduledAt: nextCheck,
            failCount: newFailCount,
          },
        });

        logger.info(
          { tokenId: job.tokenId, failCount: newFailCount },
          'Token in grace period - scheduling next re-verification'
        );

        // TODO: Send email notification to project contact
      }
    } catch (error) {
      logger.error({ error, jobId: job.id }, 'Re-verification job failed');

      await db.reverificationJob.update({
        where: { id: job.id },
        data: {
          status: ReverificationStatus.FAILED,
          completedAt: new Date(),
          results: { error: error instanceof Error ? error.message : 'Unknown error' },
        },
      });
    }
  }

  logger.info({ processed: jobs.length }, 'Re-verification jobs processed');
}

/**
 * Entry point for cron job
 */
export async function runReverificationCron(): Promise<void> {
  await scheduleReverificationJobs();
  await processReverificationJobs();
}
