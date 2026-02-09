// Token Identity Verification - Public Keys Routes
// JWKS-style endpoint for attestation signature verification

import type { FastifyInstance } from 'fastify';
import { getPublicKeys, verifySignature } from '../services/attestation-signer.js';
import { Errors } from '../lib/error-handler.js';
import { db } from '../lib/db.js';

export async function keysRoutes(app: FastifyInstance) {
  /**
   * Get all public keys (JWKS-style)
   */
  app.get(
    '/',
    {
      schema: {
        tags: ['Keys'],
        summary: 'Get public keys',
        description: `
          Returns all public keys used to sign attestations.
          Integrators should use these keys to verify attestation signatures.
          
          Key rotation: Multiple keys may exist. Use the publicKeyId from the
          attestation to find the correct key for verification.
        `,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  keys: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        algorithm: { type: 'string' },
                        publicKey: { type: 'string' },
                        createdAt: { type: 'string' },
                        isActive: { type: 'boolean' },
                      },
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
      const keys = await getPublicKeys();

      return {
        success: true,
        data: {
          keys,
          usage: {
            algorithm: 'Ed25519',
            encoding: 'base64',
            verification: 'Use the publicKeyId from an attestation to find the matching key, then verify the signature over the attestation JSON string.',
          },
        },
      };
    }
  );

  /**
   * Get a specific public key
   */
  app.get(
    '/:id',
    {
      schema: {
        tags: ['Keys'],
        summary: 'Get public key by ID',
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

      const key = await db.signingKey.findUnique({
        where: { id },
        select: {
          id: true,
          algorithm: true,
          publicKey: true,
          createdAt: true,
          isActive: true,
        },
      });

      if (!key) {
        throw Errors.notFound('Signing key');
      }

      return {
        success: true,
        data: {
          id: key.id,
          algorithm: key.algorithm,
          publicKey: key.publicKey,
          createdAt: key.createdAt.toISOString(),
          isActive: key.isActive,
        },
      };
    }
  );

  /**
   * Verify a signature (utility endpoint for integrators)
   */
  app.post(
    '/verify',
    {
      schema: {
        tags: ['Keys'],
        summary: 'Verify a signature',
        description: 'Utility endpoint to verify an attestation signature',
        body: {
          type: 'object',
          required: ['data', 'signature', 'publicKeyId'],
          properties: {
            data: { type: 'string', description: 'The attestation JSON string' },
            signature: { type: 'string', description: 'Base64 encoded signature' },
            publicKeyId: { type: 'string', description: 'ID of the public key' },
          },
        },
      },
    },
    async (request) => {
      const { data, signature, publicKeyId } = request.body as {
        data: string;
        signature: string;
        publicKeyId: string;
      };

      // Get the public key
      const key = await db.signingKey.findUnique({
        where: { id: publicKeyId },
        select: { publicKey: true },
      });

      if (!key) {
        throw Errors.notFound('Signing key');
      }

      const isValid = await verifySignature(data, signature, key.publicKey);

      return {
        success: true,
        data: {
          isValid,
          publicKeyId,
        },
      };
    }
  );
}
