// Token Identity Verification - Verification Request Routes
// Verification workflow management endpoints

import type { FastifyInstance } from 'fastify';
import { VerificationStatus, AuditActor } from '@prisma/client';
import {
  createVerificationRequestSchema,
  AUDIT_ACTIONS,
  APP_DOMAIN,
} from '@token-verify/shared';
import {
  generateSigningMessage,
  generateNonce,
  generateDnsRecord,
  generateGitHubProofContent,
  PROOF_CONSTANTS,
} from '@token-verify/shared';
import { db } from '../lib/db.js';
import { Errors } from '../lib/error-handler.js';
import { logAuditEvent, extractRequestContext } from '../services/audit-logger.js';
import { getContractInfo } from '../services/signature-verifier.js';
import { completeVerification } from '../services/verification-orchestrator.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.js';

export async function verificationRoutes(app: FastifyInstance) {
  /**
   * Create a new verification request
   * Requires API key for the token's project or admin token
   */
  app.post(
    '/requests',
    {
      preHandler: [requireAuth()],
      schema: {
        tags: ['Verification'],
        summary: 'Create verification request (requires auth)',
        description: `
          Creates a new verification request for a token. The response includes:
          - Signing message for onchain proof (to be signed by owner/deployer)
          - Instructions for DNS TXT record proof
          - Instructions for GitHub proof
          
          Requires API key for the token's project or admin token.
        `,
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['tokenId'],
          properties: {
            tokenId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const input = createVerificationRequestSchema.parse(request.body);
      const auth = (request as AuthenticatedRequest).auth;

      // Check if token exists
      const token = await db.token.findUnique({
        where: { id: input.tokenId },
        include: { project: true },
      });
      if (!token) {
        throw Errors.notFound('Token');
      }

      // Check authorization: must be admin or have key for the token's project
      if (auth.type === 'api_key' && auth.projectId !== token.projectId) {
        throw Errors.forbidden('API key does not have access to this token');
      }

      // Check for existing pending/approved requests
      const existingRequest = await db.verificationRequest.findFirst({
        where: {
          tokenId: input.tokenId,
          status: {
            in: [VerificationStatus.PENDING, VerificationStatus.APPROVED, VerificationStatus.IN_REVIEW],
          },
        },
      });

      if (existingRequest) {
        throw Errors.conflict(
          `Active verification request already exists (status: ${existingRequest.status})`
        );
      }

      // Generate nonce for proofs
      const nonce = generateNonce();
      const timestamp = Date.now();

      // Create verification request
      const verificationRequest = await db.verificationRequest.create({
        data: {
          tokenId: input.tokenId,
          nonce,
          status: VerificationStatus.PENDING,
        },
      });

      // Get contract info to customize instructions
      const contractInfo = await getContractInfo(token.chainId, token.contractAddress);

      // Generate signing message
      const signingMessage = generateSigningMessage({
        domain: APP_DOMAIN,
        chainId: token.chainId,
        contractAddress: token.contractAddress,
        timestamp,
        nonce,
        requestId: verificationRequest.id,
      });

      // Generate proof instructions
      const dnsRecord = generateDnsRecord(verificationRequest.id, nonce);
      const githubContent = generateGitHubProofContent(verificationRequest.id, nonce);

      await logAuditEvent({
        actor: auth.type === 'admin' ? AuditActor.REVIEWER : AuditActor.APPLICANT,
        action: AUDIT_ACTIONS.VERIFICATION_REQUESTED,
        targetType: 'verification_request',
        targetId: verificationRequest.id,
        metadata: { tokenId: input.tokenId },
        ...extractRequestContext(request),
      });

      reply.status(201);
      return {
        success: true,
        data: {
          requestId: verificationRequest.id,
          tokenId: token.id,
          status: verificationRequest.status,
          nonce,
          createdAt: verificationRequest.createdAt.toISOString(),

          // Contract info
          contract: {
            hasOwner: contractInfo.hasOwner,
            ownerAddress: contractInfo.owner,
            type: contractInfo.contractType,
            note: contractInfo.hasOwner
              ? 'Contract implements owner(). Please sign with the owner address for full verification.'
              : 'Contract does not implement owner(). Please sign with the deployer address for deployer-level verification.',
          },

          // Onchain signature instructions
          onchainSignature: {
            message: signingMessage,
            timestamp,
            instructions: [
              '1. Copy the message above exactly as shown',
              '2. Sign it using personal_sign (EIP-191) with the owner or deployer wallet',
              '3. Submit the signature via POST /v1/proofs/signature',
            ],
          },

          // DNS proof instructions
          dnsProof: {
            subdomain: PROOF_CONSTANTS.DNS_SUBDOMAIN,
            recordType: 'TXT',
            recordValue: dnsRecord,
            instructions: [
              `1. Add a TXT record to your domain's DNS`,
              `2. Host/Name: ${PROOF_CONSTANTS.DNS_SUBDOMAIN}`,
              `3. Value: ${dnsRecord}`,
              '4. Wait for propagation (5-15 minutes)',
              '5. Submit domain via POST /v1/proofs/dns',
            ],
          },

          // GitHub proof instructions
          githubProof: {
            filePath: PROOF_CONSTANTS.GITHUB_WELL_KNOWN_PATH,
            fileContent: githubContent,
            instructions: [
              '1. Go to your GitHub repository',
              `2. Create file: ${PROOF_CONSTANTS.GITHUB_WELL_KNOWN_PATH}`,
              `3. Content: ${githubContent}`,
              '4. Commit to main/master branch',
              '5. Submit repo via POST /v1/proofs/github',
            ],
          },
        },
      };
    }
  );

  /**
   * Get verification request by ID
   */
  app.get(
    '/requests/:id',
    {
      schema: {
        tags: ['Verification'],
        summary: 'Get verification request',
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

      const verificationRequest = await db.verificationRequest.findUnique({
        where: { id },
        include: {
          token: {
            include: { project: true },
          },
          proofs: {
            select: {
              id: true,
              type: true,
              status: true,
              payload: true,
              checkedAt: true,
              failureReason: true,
            },
          },
        },
      });

      if (!verificationRequest) {
        throw Errors.notFound('Verification request');
      }

      return {
        success: true,
        data: {
          id: verificationRequest.id,
          status: verificationRequest.status,
          nonce: verificationRequest.nonce,
          reviewerNotes: verificationRequest.reviewerNotes,
          token: {
            id: verificationRequest.token.id,
            chainId: verificationRequest.token.chainId,
            contractAddress: verificationRequest.token.contractAddress,
            symbol: verificationRequest.token.symbol,
            name: verificationRequest.token.name,
          },
          project: {
            id: verificationRequest.token.project.id,
            displayName: verificationRequest.token.project.displayName,
          },
          proofs: verificationRequest.proofs.map((p) => ({
            id: p.id,
            type: p.type,
            status: p.status,
            checkedAt: p.checkedAt?.toISOString(),
            failureReason: p.failureReason,
            // Include safe payload info (exclude raw signatures for security)
            details: (() => {
              const payload = p.payload as Record<string, unknown>;
              if (p.type === 'ONCHAIN_SIGNATURE') {
                return {
                  recoveredAddress: payload.recoveredAddress,
                  expectedAddress: payload.expectedAddress,
                  verificationTier: payload.verificationTier,
                };
              }
              if (p.type === 'DNS_TXT') {
                return {
                  domain: payload.domain,
                  subdomain: payload.subdomain,
                  foundRecords: payload.foundRecords,
                };
              }
              if (p.type === 'GITHUB_REPO') {
                return {
                  owner: payload.owner,
                  repo: payload.repo,
                  filePath: payload.filePath,
                };
              }
              return {};
            })(),
          })),
          createdAt: verificationRequest.createdAt.toISOString(),
          updatedAt: verificationRequest.updatedAt.toISOString(),
        },
      };
    }
  );

  /**
   * Run verification checks
   * Requires API key for the token's project or admin token
   */
  app.post(
    '/requests/:id/verify',
    {
      preHandler: [requireAuth()],
      schema: {
        tags: ['Verification'],
        summary: 'Run verification checks (requires auth)',
        description: 'Runs all proof checks and determines verification tier. Requires API key for the project or admin token.',
        security: [{ bearerAuth: [] }],
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
      const auth = (request as AuthenticatedRequest).auth;

      const verificationRequest = await db.verificationRequest.findUnique({
        where: { id },
        include: {
          proofs: true,
          token: true,
        },
      });

      if (!verificationRequest) {
        throw Errors.notFound('Verification request');
      }

      // Check authorization: must be admin or have key for the token's project
      if (auth.type === 'api_key' && auth.projectId !== verificationRequest.token.projectId) {
        throw Errors.forbidden('API key does not have access to this token');
      }

      if (verificationRequest.proofs.length === 0) {
        throw Errors.badRequest('No proofs submitted yet');
      }

      const result = await completeVerification(id);

      return {
        success: true,
        data: {
          requestId: id,
          verificationTier: result.tier,
          isVerified: result.success,
          attestation: result.attestation,
          error: result.error,
        },
      };
    }
  );

  /**
   * List verification requests for a token
   */
  app.get(
    '/token/:tokenId',
    {
      schema: {
        tags: ['Verification'],
        summary: 'List verification requests for token',
        params: {
          type: 'object',
          required: ['tokenId'],
          properties: {
            tokenId: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { tokenId } = request.params as { tokenId: string };

      const requests = await db.verificationRequest.findMany({
        where: { tokenId },
        orderBy: { createdAt: 'desc' },
        include: {
          proofs: {
            select: {
              type: true,
              status: true,
            },
          },
        },
      });

      return {
        success: true,
        data: {
          tokenId,
          requests: requests.map((r) => ({
            id: r.id,
            status: r.status,
            proofsSummary: r.proofs.reduce(
              (acc, p) => {
                acc[p.type] = p.status;
                return acc;
              },
              {} as Record<string, string>
            ),
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
        },
      };
    }
  );
}
