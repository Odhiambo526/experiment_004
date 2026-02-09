// Token Identity Verification - Development Routes
// DEV_MODE only routes for testing and demos
// These routes are DISABLED in production (DEV_MODE !== 'true')

import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db.js';
import { ApiError } from '../lib/error-handler.js';
import { randomUUID } from 'crypto';

const DEV_MODE = process.env.DEV_MODE === 'true';

export async function devRoutes(app: FastifyInstance) {
  // Guard: all routes in this file are disabled unless DEV_MODE=true
  if (!DEV_MODE) {
    app.get('/dev/*', async (request, reply) => {
      reply.status(404);
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Dev routes are disabled in production',
        },
      };
    });

    app.post('/dev/*', async (request, reply) => {
      reply.status(404);
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Dev routes are disabled in production',
        },
      };
    });

    return;
  }

  /**
   * Seed demo data for local testing
   * Creates a project, token, and verification request with mocked valid proofs
   */
  app.post(
    '/dev/seed',
    {
      schema: {
        tags: ['Dev'],
        summary: 'Seed demo data (DEV_MODE only)',
        description: 'Creates a sample project, token, and verification request with mocked proofs for demo purposes.',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  projectId: { type: 'string' },
                  tokenId: { type: 'string' },
                  requestId: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const timestamp = Date.now();
      const nonce = randomUUID().replace(/-/g, '').substring(0, 16);

      try {
        // Create demo project
        const project = await db.project.create({
          data: {
            displayName: `Demo Project ${timestamp}`,
            description: 'This is a demo project created for testing purposes.',
            contactEmail: 'demo@tokenverify.test',
          },
        });

        // Create demo token
        const token = await db.token.create({
          data: {
            projectId: project.id,
            chainId: 1, // Ethereum mainnet
            contractAddress: `0x${timestamp.toString(16).padStart(40, '0')}`.toLowerCase(),
            symbol: 'DEMO',
            name: 'Demo Token',
            decimals: 18,
            logoUrl: null,
            websiteUrl: 'https://demo.tokenverify.test',
          },
        });

        // Create verification request
        const verificationRequest = await db.verificationRequest.create({
          data: {
            tokenId: token.id,
            status: 'PENDING',
            nonce,
          },
        });

        // Create mocked VALID proofs
        await db.proof.createMany({
          data: [
            {
              verificationRequestId: verificationRequest.id,
              type: 'ONCHAIN_SIGNATURE',
              status: 'VALID',
              payload: {
                signature: '0xdemo_signature_mock',
                recoveredAddress: token.contractAddress,
                isOwner: true,
                isDeployer: false,
                mockedForDemo: true,
              },
              checkedAt: new Date(),
              failureReason: null,
            },
            {
              verificationRequestId: verificationRequest.id,
              type: 'DNS_TXT',
              status: 'VALID',
              payload: {
                domain: 'demo.tokenverify.test',
                recordValue: `tokenverif:v1:${verificationRequest.id}:${nonce}`,
                mockedForDemo: true,
              },
              checkedAt: new Date(),
              failureReason: null,
            },
            {
              verificationRequestId: verificationRequest.id,
              type: 'GITHUB_REPO',
              status: 'VALID',
              payload: {
                owner: 'demo-org',
                repo: 'demo-token',
                filePath: '.well-known/tokenverif.txt',
                fileContent: `tokenverif:v1:${verificationRequest.id}:${nonce}`,
                mockedForDemo: true,
              },
              checkedAt: new Date(),
              failureReason: null,
            },
          ],
        });

        // Log audit event
        await db.auditLog.create({
          data: {
            actor: 'SYSTEM',
            action: 'DEV_SEED',
            targetType: 'verification_request',
            targetId: verificationRequest.id,
            metadata: {
              projectId: project.id,
              tokenId: token.id,
              note: 'Demo data seeded for local testing',
            },
          },
        });

        return {
          success: true,
          data: {
            projectId: project.id,
            tokenId: token.id,
            requestId: verificationRequest.id,
            message: 'Demo data created with mocked valid proofs. Run verification to complete.',
          },
        };
      } catch (error) {
        throw new ApiError(500, 'SEED_FAILED', 'Failed to seed demo data', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Get dev mode status
   */
  app.get(
    '/dev/status',
    {
      schema: {
        tags: ['Dev'],
        summary: 'Dev mode status',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  devMode: { type: 'boolean' },
                  features: {
                    type: 'object',
                    properties: {
                      seedEndpoint: { type: 'boolean' },
                      mockedProofs: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      return {
        success: true,
        data: {
          devMode: DEV_MODE,
          features: {
            seedEndpoint: DEV_MODE,
            mockedProofs: DEV_MODE,
          },
        },
      };
    }
  );

  /**
   * Clear all demo data (use with caution!)
   */
  app.post(
    '/dev/clear',
    {
      schema: {
        tags: ['Dev'],
        summary: 'Clear demo data (DEV_MODE only)',
        description: 'Removes all demo data created by /dev/seed. Use with caution.',
      },
    },
    async () => {
      const result = await db.$transaction([
        db.proof.deleteMany({
          where: {
            payload: {
              path: ['mockedForDemo'],
              equals: true,
            },
          },
        }),
        db.verificationRequest.deleteMany({
          where: {
            token: {
              symbol: 'DEMO',
            },
          },
        }),
        db.token.deleteMany({
          where: {
            symbol: 'DEMO',
          },
        }),
        db.project.deleteMany({
          where: {
            displayName: {
              startsWith: 'Demo Project',
            },
          },
        }),
      ]);

      return {
        success: true,
        data: {
          deletedProofs: result[0].count,
          deletedRequests: result[1].count,
          deletedTokens: result[2].count,
          deletedProjects: result[3].count,
        },
      };
    }
  );
}
