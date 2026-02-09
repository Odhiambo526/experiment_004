// Token Identity Verification - Proof Submission Routes
// Endpoints for submitting various proof types

import type { FastifyInstance } from 'fastify';
import { VerificationStatus, ProofType, ProofStatus, AuditActor } from '@prisma/client';
import {
  submitOnchainSignatureSchema,
  submitDnsProofSchema,
  submitGitHubProofSchema,
  AUDIT_ACTIONS,
} from '@token-verify/shared';
import { db } from '../lib/db.js';
import { Errors } from '../lib/error-handler.js';
import { logAuditEvent, extractRequestContext } from '../services/audit-logger.js';
import { generateDnsInstructions } from '../services/dns-verifier.js';
import { generateGitHubInstructions } from '../services/github-verifier.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.js';

export async function proofRoutes(app: FastifyInstance) {
  /**
   * Submit onchain signature proof
   * Requires API key for the token's project or admin token
   */
  app.post(
    '/signature',
    {
      preHandler: [requireAuth()],
      schema: {
        tags: ['Proofs'],
        summary: 'Submit onchain signature proof (requires auth)',
        description: `
          Submit an EIP-191 personal_sign signature to prove control of the token contract.
          The message must match the one provided in the verification request response.
          Requires API key for the project or admin token.
        `,
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['verificationRequestId', 'signature'],
          properties: {
            verificationRequestId: { type: 'string' },
            signature: { type: 'string', pattern: '^0x[a-fA-F0-9]{130}$' },
            claimedAddress: {
              type: 'string',
              pattern: '^0x[a-fA-F0-9]{40}$',
              description: 'Optional: the address you claim to control (required if no owner() function)',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const input = submitOnchainSignatureSchema.parse(request.body);
      const { claimedAddress } = request.body as { claimedAddress?: string };
      const auth = (request as AuthenticatedRequest).auth;

      // Get verification request
      const verificationRequest = await db.verificationRequest.findUnique({
        where: { id: input.verificationRequestId },
        include: { token: true },
      });

      if (!verificationRequest) {
        throw Errors.notFound('Verification request');
      }

      // Check authorization: must be admin or have key for the token's project
      if (auth.type === 'api_key' && auth.projectId !== verificationRequest.token.projectId) {
        throw Errors.forbidden('API key does not have access to this token');
      }

      if (
        verificationRequest.status !== VerificationStatus.PENDING &&
        verificationRequest.status !== VerificationStatus.NEEDS_ACTION
      ) {
        throw Errors.badRequest(
          `Cannot submit proofs for request with status: ${verificationRequest.status}`
        );
      }

      // Check for existing signature proof
      const existingProof = await db.proof.findFirst({
        where: {
          verificationRequestId: input.verificationRequestId,
          type: ProofType.ONCHAIN_SIGNATURE,
        },
      });

      const timestamp = Date.now();
      const payload = {
        signature: input.signature,
        timestamp,
        claimedAddress: claimedAddress?.toLowerCase(),
      };

      let proof;
      if (existingProof) {
        // Update existing proof
        proof = await db.proof.update({
          where: { id: existingProof.id },
          data: {
            payload,
            status: ProofStatus.PENDING,
            failureReason: null,
            checkedAt: null,
          },
        });
      } else {
        // Create new proof
        proof = await db.proof.create({
          data: {
            verificationRequestId: input.verificationRequestId,
            type: ProofType.ONCHAIN_SIGNATURE,
            payload,
            status: ProofStatus.PENDING,
          },
        });
      }

      await logAuditEvent({
        actor: auth.type === 'admin' ? AuditActor.REVIEWER : AuditActor.APPLICANT,
        action: AUDIT_ACTIONS.PROOF_SUBMITTED,
        targetType: 'proof',
        targetId: proof.id,
        metadata: { type: ProofType.ONCHAIN_SIGNATURE },
        ...extractRequestContext(request),
      });

      reply.status(201);
      return {
        success: true,
        data: {
          proofId: proof.id,
          type: proof.type,
          status: proof.status,
          message: 'Signature proof submitted. Run verification to check.',
        },
      };
    }
  );

  /**
   * Submit DNS TXT record proof
   * Requires API key for the token's project or admin token
   */
  app.post(
    '/dns',
    {
      preHandler: [requireAuth()],
      schema: {
        tags: ['Proofs'],
        summary: 'Submit DNS TXT record proof (requires auth)',
        description: `
          Submit your domain for DNS TXT record verification.
          You must have added the TXT record as specified in the verification request.
          Requires API key for the project or admin token.
        `,
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['verificationRequestId', 'domain'],
          properties: {
            verificationRequestId: { type: 'string' },
            domain: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const input = submitDnsProofSchema.parse(request.body);
      const auth = (request as AuthenticatedRequest).auth;

      // Get verification request with token for auth check
      const verificationRequest = await db.verificationRequest.findUnique({
        where: { id: input.verificationRequestId },
        include: { token: true },
      });

      if (!verificationRequest) {
        throw Errors.notFound('Verification request');
      }

      // Check authorization: must be admin or have key for the token's project
      if (auth.type === 'api_key' && auth.projectId !== verificationRequest.token.projectId) {
        throw Errors.forbidden('API key does not have access to this token');
      }

      if (
        verificationRequest.status !== VerificationStatus.PENDING &&
        verificationRequest.status !== VerificationStatus.NEEDS_ACTION
      ) {
        throw Errors.badRequest(
          `Cannot submit proofs for request with status: ${verificationRequest.status}`
        );
      }

      // Get instructions for reference
      const instructions = generateDnsInstructions({
        domain: input.domain,
        requestId: input.verificationRequestId,
        nonce: verificationRequest.nonce,
      });

      // Check for existing DNS proof
      const existingProof = await db.proof.findFirst({
        where: {
          verificationRequestId: input.verificationRequestId,
          type: ProofType.DNS_TXT,
        },
      });

      const payload = {
        domain: input.domain,
        expectedRecord: instructions.recordValue,
      };

      let proof;
      if (existingProof) {
        proof = await db.proof.update({
          where: { id: existingProof.id },
          data: {
            payload,
            status: ProofStatus.PENDING,
            failureReason: null,
            checkedAt: null,
          },
        });
      } else {
        proof = await db.proof.create({
          data: {
            verificationRequestId: input.verificationRequestId,
            type: ProofType.DNS_TXT,
            payload,
            status: ProofStatus.PENDING,
          },
        });
      }

      await logAuditEvent({
        actor: auth.type === 'admin' ? AuditActor.REVIEWER : AuditActor.APPLICANT,
        action: AUDIT_ACTIONS.PROOF_SUBMITTED,
        targetType: 'proof',
        targetId: proof.id,
        metadata: { type: ProofType.DNS_TXT, domain: input.domain },
        ...extractRequestContext(request),
      });

      reply.status(201);
      return {
        success: true,
        data: {
          proofId: proof.id,
          type: proof.type,
          status: proof.status,
          expectedRecord: instructions.recordValue,
          recordHost: instructions.recordHost,
          message: 'DNS proof submitted. Run verification to check.',
        },
      };
    }
  );

  /**
   * Submit GitHub repository proof
   * Requires API key for the token's project or admin token
   */
  app.post(
    '/github',
    {
      preHandler: [requireAuth()],
      schema: {
        tags: ['Proofs'],
        summary: 'Submit GitHub repository proof (requires auth)',
        description: `
          Submit your GitHub repository for verification.
          The repository must contain the proof file at .well-known/tokenverif.txt
          Requires API key for the project or admin token.
        `,
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['verificationRequestId', 'owner', 'repo'],
          properties: {
            verificationRequestId: { type: 'string' },
            owner: { type: 'string' },
            repo: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const input = submitGitHubProofSchema.parse(request.body);
      const auth = (request as AuthenticatedRequest).auth;

      // Get verification request with token for auth check
      const verificationRequest = await db.verificationRequest.findUnique({
        where: { id: input.verificationRequestId },
        include: { token: true },
      });

      if (!verificationRequest) {
        throw Errors.notFound('Verification request');
      }

      // Check authorization: must be admin or have key for the token's project
      if (auth.type === 'api_key' && auth.projectId !== verificationRequest.token.projectId) {
        throw Errors.forbidden('API key does not have access to this token');
      }

      if (
        verificationRequest.status !== VerificationStatus.PENDING &&
        verificationRequest.status !== VerificationStatus.NEEDS_ACTION
      ) {
        throw Errors.badRequest(
          `Cannot submit proofs for request with status: ${verificationRequest.status}`
        );
      }

      // Get instructions for reference
      const instructions = generateGitHubInstructions({
        owner: input.owner,
        repo: input.repo,
        requestId: input.verificationRequestId,
        nonce: verificationRequest.nonce,
      });

      // Check for existing GitHub proof
      const existingProof = await db.proof.findFirst({
        where: {
          verificationRequestId: input.verificationRequestId,
          type: ProofType.GITHUB_REPO,
        },
      });

      const payload = {
        owner: input.owner,
        repo: input.repo,
        expectedContent: instructions.fileContent,
      };

      let proof;
      if (existingProof) {
        proof = await db.proof.update({
          where: { id: existingProof.id },
          data: {
            payload,
            status: ProofStatus.PENDING,
            failureReason: null,
            checkedAt: null,
          },
        });
      } else {
        proof = await db.proof.create({
          data: {
            verificationRequestId: input.verificationRequestId,
            type: ProofType.GITHUB_REPO,
            payload,
            status: ProofStatus.PENDING,
          },
        });
      }

      await logAuditEvent({
        actor: auth.type === 'admin' ? AuditActor.REVIEWER : AuditActor.APPLICANT,
        action: AUDIT_ACTIONS.PROOF_SUBMITTED,
        targetType: 'proof',
        targetId: proof.id,
        metadata: { type: ProofType.GITHUB_REPO, owner: input.owner, repo: input.repo },
        ...extractRequestContext(request),
      });

      reply.status(201);
      return {
        success: true,
        data: {
          proofId: proof.id,
          type: proof.type,
          status: proof.status,
          expectedFile: instructions.filePath,
          expectedContent: instructions.fileContent,
          repoUrl: `https://github.com/${input.owner}/${input.repo}`,
          message: 'GitHub proof submitted. Run verification to check.',
        },
      };
    }
  );

  /**
   * Get proof status
   */
  app.get(
    '/:id',
    {
      schema: {
        tags: ['Proofs'],
        summary: 'Get proof status',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };

      const proof = await db.proof.findUnique({
        where: { id },
        include: {
          verificationRequest: {
            select: { id: true, status: true },
          },
        },
      });

      if (!proof) {
        throw Errors.notFound('Proof');
      }

      return {
        success: true,
        data: {
          id: proof.id,
          type: proof.type,
          status: proof.status,
          checkedAt: proof.checkedAt?.toISOString(),
          failureReason: proof.failureReason,
          verificationRequest: proof.verificationRequest,
          createdAt: proof.createdAt.toISOString(),
          updatedAt: proof.updatedAt.toISOString(),
        },
      };
    }
  );
}
