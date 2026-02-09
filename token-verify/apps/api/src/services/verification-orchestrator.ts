// Token Identity Verification - Verification Orchestrator
// Coordinates the verification workflow and determines final verification tier

import { VerificationStatus, ProofStatus, ProofType, AuditActor, type Prisma } from '@prisma/client';
import { VerificationTier, AUDIT_ACTIONS } from '@token-verify/shared';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { logAuditEvent } from './audit-logger.js';
import { verifySignature as verifyOnchainSignature } from './signature-verifier.js';
import { verifyDnsTxtProof } from './dns-verifier.js';
import { verifyGitHubProof } from './github-verifier.js';
import { createAttestation } from './attestation-signer.js';

/**
 * Determine the verification tier based on proof statuses
 * 
 * VERIFICATION RULES:
 * - tier = "verified": onchain_signature valid (owner tier) + at least 2 offchain proofs valid
 * - tier = "deployer_verified": onchain_signature valid (deployer tier) + at least 1 offchain proof valid
 * - tier = "unverified": otherwise
 */
export function calculateVerificationTier(proofs: Array<{
  type: ProofType;
  status: ProofStatus;
  payload: Prisma.JsonValue;
}>): VerificationTier {
  // Find onchain signature proof
  const signatureProof = proofs.find((p) => p.type === ProofType.ONCHAIN_SIGNATURE);
  
  if (!signatureProof || signatureProof.status !== ProofStatus.VALID) {
    return VerificationTier.UNVERIFIED;
  }

  // Check signature tier from payload
  const payload = signatureProof.payload as { verificationTier?: string } | null;
  const signatureTier = payload?.verificationTier;

  // Count valid offchain proofs
  const validOffchainProofs = proofs.filter(
    (p) =>
      p.type !== ProofType.ONCHAIN_SIGNATURE &&
      p.status === ProofStatus.VALID
  );

  const offchainCount = validOffchainProofs.length;

  if (signatureTier === 'owner' && offchainCount >= 2) {
    return VerificationTier.VERIFIED;
  }

  if (signatureTier === 'deployer' && offchainCount >= 1) {
    return VerificationTier.DEPLOYER_VERIFIED;
  }

  // Owner tier with only 1 offchain proof = deployer_verified level
  if (signatureTier === 'owner' && offchainCount >= 1) {
    return VerificationTier.DEPLOYER_VERIFIED;
  }

  return VerificationTier.UNVERIFIED;
}

/**
 * Run verification checks for a request
 */
export async function runVerificationChecks(requestId: string): Promise<{
  tier: VerificationTier;
  proofResults: Array<{
    id: string;
    type: ProofType;
    status: ProofStatus;
    error?: string;
  }>;
}> {
  const request = await db.verificationRequest.findUnique({
    where: { id: requestId },
    include: {
      proofs: true,
      token: {
        include: { project: true },
      },
    },
  });

  if (!request) {
    throw new Error('Verification request not found');
  }

  const proofResults: Array<{
    id: string;
    type: ProofType;
    status: ProofStatus;
    error?: string;
  }> = [];

  // Run checks for each proof
  for (const proof of request.proofs) {
    let status: ProofStatus = ProofStatus.PENDING;
    let error: string | undefined;
    let updatedPayload: Prisma.InputJsonValue = proof.payload as Prisma.InputJsonValue;

    try {
      switch (proof.type) {
        case ProofType.ONCHAIN_SIGNATURE: {
          const payload = proof.payload as {
            signature: string;
            timestamp: number;
            claimedAddress?: string;
          } | null;

          if (!payload?.signature) {
            status = ProofStatus.INVALID;
            error = 'Missing signature';
            break;
          }

          const result = await verifyOnchainSignature({
            chainId: request.token.chainId,
            contractAddress: request.token.contractAddress,
            signature: payload.signature,
            requestId: request.id,
            nonce: request.nonce,
            timestamp: payload.timestamp,
            claimedAddress: payload.claimedAddress,
          });

          status = result.isValid ? ProofStatus.VALID : ProofStatus.INVALID;
          error = result.error;
          updatedPayload = {
            ...payload,
            recoveredAddress: result.recoveredAddress,
            expectedAddress: result.expectedAddress,
            verificationTier: result.verificationTier,
            contractType: result.contractType,
          };
          break;
        }

        case ProofType.DNS_TXT: {
          const payload = proof.payload as { domain: string } | null;
          
          if (!payload?.domain) {
            status = ProofStatus.INVALID;
            error = 'Missing domain';
            break;
          }

          const result = await verifyDnsTxtProof({
            domain: payload.domain,
            requestId: request.id,
            nonce: request.nonce,
          });

          status = result.isValid ? ProofStatus.VALID : ProofStatus.INVALID;
          error = result.error;
          updatedPayload = {
            ...payload,
            subdomain: result.subdomain,
            expectedRecord: result.expectedRecord,
            foundRecords: result.foundRecords,
          };
          break;
        }

        case ProofType.GITHUB_REPO: {
          const payload = proof.payload as { owner: string; repo: string } | null;

          if (!payload?.owner || !payload?.repo) {
            status = ProofStatus.INVALID;
            error = 'Missing owner or repo';
            break;
          }

          const result = await verifyGitHubProof({
            owner: payload.owner,
            repo: payload.repo,
            requestId: request.id,
            nonce: request.nonce,
          });

          status = result.isValid ? ProofStatus.VALID : ProofStatus.INVALID;
          error = result.error;
          updatedPayload = {
            ...payload,
            filePath: result.filePath,
            expectedContent: result.expectedContent,
            foundContent: result.foundContent,
          };
          break;
        }

        default:
          logger.warn({ proofType: proof.type }, 'Unknown proof type');
          status = ProofStatus.INVALID;
          error = 'Unknown proof type';
      }
    } catch (err) {
      status = ProofStatus.INVALID;
      error = err instanceof Error ? err.message : 'Check failed';
      logger.error({ err, proofId: proof.id }, 'Proof check failed');
    }

    // Update proof in database
    await db.proof.update({
      where: { id: proof.id },
      data: {
        status,
        payload: updatedPayload,
        checkedAt: new Date(),
        failureReason: error || null,
      },
    });

    // Log audit event
    await logAuditEvent({
      actor: AuditActor.SYSTEM,
      action: status === ProofStatus.VALID ? AUDIT_ACTIONS.PROOF_VALID : AUDIT_ACTIONS.PROOF_INVALID,
      targetType: 'proof',
      targetId: proof.id,
      metadata: { type: proof.type, status, error },
    });

    proofResults.push({ id: proof.id, type: proof.type, status, error });
  }

  // Calculate final verification tier
  const updatedProofs = await db.proof.findMany({
    where: { verificationRequestId: requestId },
  });

  const tier = calculateVerificationTier(updatedProofs);

  return { tier, proofResults };
}

/**
 * Complete verification and issue attestation if successful
 */
export async function completeVerification(
  requestId: string,
  reviewerNotes?: string
): Promise<{
  success: boolean;
  tier: VerificationTier;
  attestation?: unknown;
  error?: string;
}> {
  const { tier, proofResults } = await runVerificationChecks(requestId);

  const request = await db.verificationRequest.findUnique({
    where: { id: requestId },
    include: {
      token: { include: { project: true } },
      proofs: true,
    },
  });

  if (!request) {
    return { success: false, tier: VerificationTier.UNVERIFIED, error: 'Request not found' };
  }

  // Determine new status
  let newStatus: VerificationStatus;
  if (tier === VerificationTier.VERIFIED || tier === VerificationTier.DEPLOYER_VERIFIED) {
    newStatus = VerificationStatus.APPROVED;
  } else {
    // Check if any proofs failed
    const hasFailedProofs = proofResults.some((p) => p.status === ProofStatus.INVALID);
    newStatus = hasFailedProofs ? VerificationStatus.NEEDS_ACTION : VerificationStatus.PENDING;
  }

  // Update request status
  await db.verificationRequest.update({
    where: { id: requestId },
    data: {
      status: newStatus,
      reviewerNotes,
      reviewedAt: newStatus === VerificationStatus.APPROVED ? new Date() : null,
    },
  });

  // Log audit event
  await logAuditEvent({
    actor: AuditActor.SYSTEM,
    action: newStatus === VerificationStatus.APPROVED
      ? AUDIT_ACTIONS.VERIFICATION_APPROVED
      : AUDIT_ACTIONS.PROOF_CHECKED,
    targetType: 'verification_request',
    targetId: requestId,
    metadata: { tier, status: newStatus, proofResults },
  });

  // Issue attestation if approved
  if (newStatus === VerificationStatus.APPROVED) {
    const attestation = await createAttestation({
      token: {
        id: request.token.id,
        chainId: request.token.chainId,
        contractAddress: request.token.contractAddress,
        symbol: request.token.symbol,
        name: request.token.name,
        decimals: request.token.decimals ?? undefined,
        logoUrl: request.token.logoUrl ?? undefined,
        websiteUrl: request.token.websiteUrl ?? undefined,
      },
      verificationTier: tier,
      requestId: request.id,
      proofs: request.proofs.map((p) => ({
        type: p.type,
        status: p.status === ProofStatus.VALID ? 'valid' as const : 'invalid' as const,
        checkedAt: p.checkedAt ?? new Date(),
      })),
      project: {
        id: request.token.project.id,
        displayName: request.token.project.displayName,
        websiteUrl: request.token.project.contactEmail ?? undefined,
      },
    });

    await logAuditEvent({
      actor: AuditActor.SYSTEM,
      action: AUDIT_ACTIONS.ATTESTATION_ISSUED,
      targetType: 'token',
      targetId: request.token.id,
      metadata: { tier },
    });

    return { success: true, tier, attestation };
  }

  return { success: false, tier, error: 'Verification requirements not met' };
}

/**
 * Revoke a verification
 */
export async function revokeVerification(
  requestId: string,
  reason: string
): Promise<void> {
  const request = await db.verificationRequest.findUnique({
    where: { id: requestId },
    include: { token: true },
  });

  if (!request) {
    throw new Error('Verification request not found');
  }

  // Update request status
  await db.verificationRequest.update({
    where: { id: requestId },
    data: {
      status: VerificationStatus.REVOKED,
      reviewerNotes: reason,
    },
  });

  // Revoke any active attestations
  await db.attestation.updateMany({
    where: {
      tokenId: request.tokenId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });

  await logAuditEvent({
    actor: AuditActor.SYSTEM,
    action: AUDIT_ACTIONS.VERIFICATION_REVOKED,
    targetType: 'verification_request',
    targetId: requestId,
    metadata: { reason },
  });

  logger.info({ requestId, reason }, 'Verification revoked');
}
