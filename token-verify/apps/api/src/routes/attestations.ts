// Token Identity Verification - Attestation Routes
// Signed attestation retrieval endpoints for integrators

import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db.js';
import { Errors } from '../lib/error-handler.js';
import { getLatestAttestation } from '../services/attestation-signer.js';

export async function attestationRoutes(app: FastifyInstance) {
  /**
   * Get attestation by chain and contract address
   */
  app.get(
    '/:chainId/:contractAddress',
    {
      schema: {
        tags: ['Attestations'],
        summary: 'Get attestation for token',
        description: `
          Returns the signed attestation for a verified token.
          Integrators can use this to verify token identity.
          
          The response includes:
          - attestation: The token metadata and verification details
          - signature: Ed25519 signature of the attestation JSON
          - publicKeyId: ID of the signing key (verify via /v1/keys)
        `,
        params: {
          type: 'object',
          required: ['chainId', 'contractAddress'],
          properties: {
            chainId: { type: 'string' },
            contractAddress: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  attestation: { type: 'object' },
                  signature: { type: 'string' },
                  publicKeyId: { type: 'string' },
                  issuedAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { chainId, contractAddress } = request.params as {
        chainId: string;
        contractAddress: string;
      };

      const attestation = await getLatestAttestation(
        parseInt(chainId, 10),
        contractAddress.toLowerCase()
      );

      if (!attestation) {
        throw Errors.notFound('Attestation');
      }

      return {
        success: true,
        data: attestation,
      };
    }
  );

  /**
   * List attestations for a token (version history)
   */
  app.get(
    '/:chainId/:contractAddress/history',
    {
      schema: {
        tags: ['Attestations'],
        summary: 'Get attestation history',
        description: 'Returns all attestation versions for a token',
        params: {
          type: 'object',
          required: ['chainId', 'contractAddress'],
          properties: {
            chainId: { type: 'string' },
            contractAddress: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { chainId, contractAddress } = request.params as {
        chainId: string;
        contractAddress: string;
      };

      const token = await db.token.findUnique({
        where: {
          chainId_contractAddress: {
            chainId: parseInt(chainId, 10),
            contractAddress: contractAddress.toLowerCase(),
          },
        },
      });

      if (!token) {
        throw Errors.notFound('Token');
      }

      const attestations = await db.attestation.findMany({
        where: { tokenId: token.id },
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          signature: true,
          publicKeyId: true,
          issuedAt: true,
          revokedAt: true,
          revokedReason: true,
        },
      });

      return {
        success: true,
        data: {
          chainId: parseInt(chainId, 10),
          contractAddress: contractAddress.toLowerCase(),
          attestations: attestations.map((a) => ({
            id: a.id,
            version: a.version,
            issuedAt: a.issuedAt.toISOString(),
            isRevoked: a.revokedAt !== null,
            revokedAt: a.revokedAt?.toISOString(),
            revokedReason: a.revokedReason,
          })),
        },
      };
    }
  );

  /**
   * Get specific attestation version
   */
  app.get(
    '/:chainId/:contractAddress/version/:version',
    {
      schema: {
        tags: ['Attestations'],
        summary: 'Get specific attestation version',
        params: {
          type: 'object',
          required: ['chainId', 'contractAddress', 'version'],
          properties: {
            chainId: { type: 'string' },
            contractAddress: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { chainId, contractAddress, version } = request.params as {
        chainId: string;
        contractAddress: string;
        version: string;
      };

      const token = await db.token.findUnique({
        where: {
          chainId_contractAddress: {
            chainId: parseInt(chainId, 10),
            contractAddress: contractAddress.toLowerCase(),
          },
        },
      });

      if (!token) {
        throw Errors.notFound('Token');
      }

      const attestation = await db.attestation.findFirst({
        where: {
          tokenId: token.id,
          version: parseInt(version, 10),
        },
      });

      if (!attestation) {
        throw Errors.notFound('Attestation version');
      }

      return {
        success: true,
        data: {
          attestation: attestation.attestationJson,
          signature: attestation.signature,
          publicKeyId: attestation.publicKeyId,
          issuedAt: attestation.issuedAt.toISOString(),
          version: attestation.version,
          isRevoked: attestation.revokedAt !== null,
          revokedAt: attestation.revokedAt?.toISOString(),
          revokedReason: attestation.revokedReason,
        },
      };
    }
  );
}
