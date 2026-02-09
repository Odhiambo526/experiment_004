// Token Identity Verification - API Key Management Routes
// Admin-only endpoints for managing project API keys (Milestone 2)

import type { FastifyInstance } from 'fastify';
import { AuditActor } from '@prisma/client';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { Errors } from '../lib/error-handler.js';
import { requireAdmin, generateApiKey, isAdminEnabled } from '../lib/auth.js';
import { logAuditEvent, extractRequestContext } from '../services/audit-logger.js';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

export async function apiKeyRoutes(app: FastifyInstance) {
  // Guard: all routes require admin token
  // If ADMIN_TOKEN not set, these routes return 404
  
  /**
   * Create a new API key for a project
   * IMPORTANT: The plaintext key is only returned ONCE on creation
   */
  app.post(
    '/projects/:projectId/api-keys',
    {
      preHandler: [requireAdmin()],
      schema: {
        tags: ['API Keys'],
        summary: 'Create API key for project (admin only)',
        description: 'Creates a new API key for the specified project. The plaintext key is only returned once - store it securely.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['projectId'],
          properties: {
            projectId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  keyPrefix: { type: 'string' },
                  key: { type: 'string', description: 'Plaintext key - ONLY SHOWN ONCE' },
                  expiresAt: { type: 'string', nullable: true },
                  createdAt: { type: 'string' },
                },
              },
              warning: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const input = createApiKeySchema.parse(request.body);
      
      // Verify project exists
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project) {
        throw Errors.notFound('Project');
      }
      
      // Generate new key
      const { plaintext, hash, prefix } = await generateApiKey();
      
      // Store key
      const apiKey = await db.apiKey.create({
        data: {
          projectId,
          name: input.name,
          keyHash: hash,
          keyPrefix: prefix,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      
      await logAuditEvent({
        actor: AuditActor.REVIEWER,
        action: 'api_key.created',
        targetType: 'api_key',
        targetId: apiKey.id,
        metadata: { projectId, name: input.name, keyPrefix: prefix },
        ...extractRequestContext(request),
      });
      
      reply.status(201);
      return {
        success: true,
        data: {
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          key: plaintext, // Only returned once!
          expiresAt: apiKey.expiresAt?.toISOString() ?? null,
          createdAt: apiKey.createdAt.toISOString(),
        },
        warning: 'Store this key securely - it will not be shown again.',
      };
    }
  );
  
  /**
   * List API keys for a project (no plaintext keys shown)
   */
  app.get(
    '/projects/:projectId/api-keys',
    {
      preHandler: [requireAdmin()],
      schema: {
        tags: ['API Keys'],
        summary: 'List API keys for project (admin only)',
        description: 'Lists all API keys for a project. Plaintext keys are never shown - only the prefix for identification.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['projectId'],
          properties: {
            projectId: { type: 'string' },
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
                  projectId: { type: 'string' },
                  keys: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        keyPrefix: { type: 'string' },
                        createdAt: { type: 'string' },
                        lastUsedAt: { type: 'string', nullable: true },
                        expiresAt: { type: 'string', nullable: true },
                        revokedAt: { type: 'string', nullable: true },
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
    async (request) => {
      const { projectId } = request.params as { projectId: string };
      
      // Verify project exists
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project) {
        throw Errors.notFound('Project');
      }
      
      const keys = await db.apiKey.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });
      
      return {
        success: true,
        data: {
          projectId,
          keys: keys.map((key) => ({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            createdAt: key.createdAt.toISOString(),
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
            expiresAt: key.expiresAt?.toISOString() ?? null,
            revokedAt: key.revokedAt?.toISOString() ?? null,
            isActive: !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date()),
          })),
        },
      };
    }
  );
  
  /**
   * Revoke an API key
   */
  app.post(
    '/api-keys/:id/revoke',
    {
      preHandler: [requireAdmin()],
      schema: {
        tags: ['API Keys'],
        summary: 'Revoke an API key (admin only)',
        description: 'Revokes an API key. Revoked keys cannot be used for authentication.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
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
                  id: { type: 'string' },
                  revokedAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      
      const apiKey = await db.apiKey.findUnique({ where: { id } });
      if (!apiKey) {
        throw Errors.notFound('API key');
      }
      
      if (apiKey.revokedAt) {
        throw Errors.badRequest('API key is already revoked');
      }
      
      const updated = await db.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      
      await logAuditEvent({
        actor: AuditActor.REVIEWER,
        action: 'api_key.revoked',
        targetType: 'api_key',
        targetId: id,
        metadata: { projectId: apiKey.projectId, keyPrefix: apiKey.keyPrefix },
        ...extractRequestContext(request),
      });
      
      return {
        success: true,
        data: {
          id: updated.id,
          revokedAt: updated.revokedAt!.toISOString(),
        },
      };
    }
  );
  
  /**
   * Get authentication status info (for debugging)
   */
  app.get(
    '/auth/status',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'Get authentication status',
        description: 'Returns information about the current authentication state and whether admin endpoints are enabled.',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  adminEnabled: { type: 'boolean' },
                  authenticated: { type: 'boolean' },
                  authType: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const auth = (request as any).auth || { type: 'none' };
      
      return {
        success: true,
        data: {
          adminEnabled: isAdminEnabled(),
          authenticated: auth.type !== 'none',
          authType: auth.type,
        },
      };
    }
  );
}
