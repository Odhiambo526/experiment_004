// Token Identity Verification - Project Routes
// Project management endpoints

import type { FastifyInstance } from 'fastify';
import { AuditActor } from '@prisma/client';
import { createProjectSchema, AUDIT_ACTIONS } from '@token-verify/shared';
import { db } from '../lib/db.js';
import { Errors } from '../lib/error-handler.js';
import { logAuditEvent, extractRequestContext } from '../services/audit-logger.js';
import { requireAdmin, requireAuth, type AuthenticatedRequest } from '../lib/auth.js';

export async function projectRoutes(app: FastifyInstance) {
  /**
   * Create a new project
   * Requires ADMIN_TOKEN - projects can only be created by admins
   * After creation, admin should create an API key for the project
   */
  app.post(
    '/',
    {
      preHandler: [requireAdmin()],
      schema: {
        tags: ['Projects'],
        summary: 'Create a new project (admin only)',
        description: 'Creates a new project for a token issuer/team. Requires admin token.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['displayName'],
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 1000 },
            contactEmail: { type: 'string', format: 'email' },
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
                  displayName: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  contactEmail: { type: 'string', nullable: true },
                  createdAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const input = createProjectSchema.parse(request.body);

      const project = await db.project.create({
        data: {
          displayName: input.displayName,
          description: input.description,
          contactEmail: input.contactEmail,
        },
      });

      await logAuditEvent({
        actor: AuditActor.REVIEWER, // Admin created the project
        action: AUDIT_ACTIONS.PROJECT_CREATED,
        targetType: 'project',
        targetId: project.id,
        metadata: { displayName: input.displayName },
        ...extractRequestContext(request),
      });

      reply.status(201);
      return {
        success: true,
        data: {
          id: project.id,
          displayName: project.displayName,
          description: project.description,
          contactEmail: project.contactEmail,
          createdAt: project.createdAt.toISOString(),
        },
      };
    }
  );

  /**
   * Get a project by ID
   */
  app.get(
    '/:id',
    {
      schema: {
        tags: ['Projects'],
        summary: 'Get project by ID',
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
                  displayName: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  contactEmail: { type: 'string', nullable: true },
                  createdAt: { type: 'string' },
                  tokensCount: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };

      const project = await db.project.findUnique({
        where: { id },
        include: {
          _count: {
            select: { tokens: true },
          },
        },
      });

      if (!project) {
        throw Errors.notFound('Project');
      }

      return {
        success: true,
        data: {
          id: project.id,
          displayName: project.displayName,
          description: project.description,
          contactEmail: project.contactEmail,
          createdAt: project.createdAt.toISOString(),
          tokensCount: project._count.tokens,
        },
      };
    }
  );

  /**
   * Update a project
   * Requires API key belonging to this project or admin token
   */
  app.patch(
    '/:id',
    {
      preHandler: [requireAuth()],
      schema: {
        tags: ['Projects'],
        summary: 'Update project (requires auth)',
        description: 'Updates a project. Requires API key for this project or admin token.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 1000 },
            contactEmail: { type: 'string', format: 'email' },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = request.body as {
        displayName?: string;
        description?: string;
        contactEmail?: string;
      };
      const auth = (request as AuthenticatedRequest).auth;

      const existing = await db.project.findUnique({ where: { id } });
      if (!existing) {
        throw Errors.notFound('Project');
      }

      // Check authorization: must be admin or have key for this project
      if (auth.type === 'api_key' && auth.projectId !== id) {
        throw Errors.forbidden('API key does not have access to this project');
      }

      const project = await db.project.update({
        where: { id },
        data: {
          displayName: input.displayName ?? existing.displayName,
          description: input.description,
          contactEmail: input.contactEmail,
        },
      });

      await logAuditEvent({
        actor: auth.type === 'admin' ? AuditActor.REVIEWER : AuditActor.APPLICANT,
        action: AUDIT_ACTIONS.PROJECT_UPDATED,
        targetType: 'project',
        targetId: project.id,
        metadata: input,
        ...extractRequestContext(request),
      });

      return {
        success: true,
        data: {
          id: project.id,
          displayName: project.displayName,
          description: project.description,
          contactEmail: project.contactEmail,
          updatedAt: project.updatedAt.toISOString(),
        },
      };
    }
  );

  /**
   * Get tokens for a project
   */
  app.get(
    '/:id/tokens',
    {
      schema: {
        tags: ['Projects'],
        summary: 'Get project tokens',
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

      const project = await db.project.findUnique({ where: { id } });
      if (!project) {
        throw Errors.notFound('Project');
      }

      const tokens = await db.token.findMany({
        where: { projectId: id },
        include: {
          verificationRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      return {
        success: true,
        data: {
          projectId: id,
          tokens: tokens.map((token) => ({
            id: token.id,
            chainId: token.chainId,
            contractAddress: token.contractAddress,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            logoUrl: token.logoUrl,
            verificationStatus: token.verificationRequests[0]?.status ?? 'none',
            createdAt: token.createdAt.toISOString(),
          })),
        },
      };
    }
  );
}
