// Token Identity Verification - Token Routes
// Token registration and management endpoints

import type { FastifyInstance } from 'fastify';
import { AuditActor } from '@prisma/client';
import { createTokenSchema, AUDIT_ACTIONS } from '@token-verify/shared';
import { db } from '../lib/db.js';
import { Errors } from '../lib/error-handler.js';
import { logAuditEvent, extractRequestContext } from '../services/audit-logger.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.js';

export async function tokenRoutes(app: FastifyInstance) {
  /**
   * Register a new token
   * Requires API key for the project or admin token
   */
  app.post(
    '/',
    {
      preHandler: [requireAuth()],
      schema: {
        tags: ['Tokens'],
        summary: 'Register a new token (requires auth)',
        description: `
          Registers a token for verification. Each token is uniquely identified by (chainId, contractAddress).
          Requires API key for the project or admin token.
          
          **Important**: Multiple tokens can share the same symbol. Verification helps users 
          identify which token is the canonical one for a project.
        `,
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['projectId', 'chainId', 'contractAddress', 'symbol', 'name'],
          properties: {
            projectId: { type: 'string' },
            chainId: { type: 'number' },
            contractAddress: { type: 'string' },
            symbol: { type: 'string' },
            name: { type: 'string' },
            decimals: { type: 'number', minimum: 0, maximum: 18 },
            logoUrl: { type: 'string', format: 'uri' },
            websiteUrl: { type: 'string', format: 'uri' },
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
                  chainId: { type: 'number' },
                  contractAddress: { type: 'string' },
                  symbol: { type: 'string' },
                  name: { type: 'string' },
                  decimals: { type: 'number', nullable: true },
                  logoUrl: { type: 'string', nullable: true },
                  websiteUrl: { type: 'string', nullable: true },
                  createdAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const input = createTokenSchema.parse(request.body);
      const auth = (request as AuthenticatedRequest).auth;

      // Check if project exists
      const project = await db.project.findUnique({
        where: { id: input.projectId },
      });
      if (!project) {
        throw Errors.notFound('Project');
      }

      // Check authorization: must be admin or have key for this project
      if (auth.type === 'api_key' && auth.projectId !== input.projectId) {
        throw Errors.forbidden('API key does not have access to this project');
      }

      // Check if token already exists for this chain + address
      const existing = await db.token.findUnique({
        where: {
          chainId_contractAddress: {
            chainId: input.chainId,
            contractAddress: input.contractAddress,
          },
        },
      });

      if (existing) {
        throw Errors.conflict(
          `Token already registered for chain ${input.chainId} at ${input.contractAddress}`
        );
      }

      const token = await db.token.create({
        data: {
          projectId: input.projectId,
          chainId: input.chainId,
          contractAddress: input.contractAddress,
          symbol: input.symbol,
          name: input.name,
          decimals: input.decimals,
          logoUrl: input.logoUrl,
          websiteUrl: input.websiteUrl,
        },
      });

      await logAuditEvent({
        actor: auth.type === 'admin' ? AuditActor.REVIEWER : AuditActor.APPLICANT,
        action: AUDIT_ACTIONS.TOKEN_CREATED,
        targetType: 'token',
        targetId: token.id,
        metadata: {
          chainId: input.chainId,
          contractAddress: input.contractAddress,
          symbol: input.symbol,
        },
        ...extractRequestContext(request),
      });

      reply.status(201);
      return {
        success: true,
        data: {
          id: token.id,
          chainId: token.chainId,
          contractAddress: token.contractAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoUrl: token.logoUrl,
          websiteUrl: token.websiteUrl,
          createdAt: token.createdAt.toISOString(),
        },
      };
    }
  );

  // Note: GET /:chainId/:contractAddress is handled by public routes

  /**
   * Update a token
   * Requires API key for the token's project or admin token
   */
  app.patch(
    '/:id',
    {
      preHandler: [requireAuth()],
      schema: {
        tags: ['Tokens'],
        summary: 'Update token metadata (requires auth)',
        description: 'Updates token metadata. Requires API key for the project or admin token.',
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
            name: { type: 'string' },
            decimals: { type: 'number', minimum: 0, maximum: 18 },
            logoUrl: { type: 'string', format: 'uri' },
            websiteUrl: { type: 'string', format: 'uri' },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = request.body as {
        name?: string;
        decimals?: number;
        logoUrl?: string;
        websiteUrl?: string;
      };
      const auth = (request as AuthenticatedRequest).auth;

      const existing = await db.token.findUnique({ where: { id } });
      if (!existing) {
        throw Errors.notFound('Token');
      }

      // Check authorization: must be admin or have key for the token's project
      if (auth.type === 'api_key' && auth.projectId !== existing.projectId) {
        throw Errors.forbidden('API key does not have access to this token');
      }

      // Cannot update symbol or contract address - these are immutable
      const token = await db.token.update({
        where: { id },
        data: {
          name: input.name ?? existing.name,
          decimals: input.decimals,
          logoUrl: input.logoUrl,
          websiteUrl: input.websiteUrl,
        },
      });

      await logAuditEvent({
        actor: auth.type === 'admin' ? AuditActor.REVIEWER : AuditActor.APPLICANT,
        action: AUDIT_ACTIONS.TOKEN_UPDATED,
        targetType: 'token',
        targetId: token.id,
        metadata: input,
        ...extractRequestContext(request),
      });

      return {
        success: true,
        data: {
          id: token.id,
          chainId: token.chainId,
          contractAddress: token.contractAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoUrl: token.logoUrl,
          websiteUrl: token.websiteUrl,
          updatedAt: token.updatedAt.toISOString(),
        },
      };
    }
  );
}
