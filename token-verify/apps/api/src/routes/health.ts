// Token Identity Verification - Health Check Routes
// Service health and status endpoints

import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db.js';

// Track server start time for uptime calculation
const startTime = Date.now();

export async function healthRoutes(app: FastifyInstance) {
  /**
   * Basic health check
   */
  app.get(
    '/status',
    {
      schema: {
        tags: ['Health'],
        summary: 'Service health check',
        description: 'Returns service health status, version, and build information',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  version: { type: 'string' },
                  build: { type: 'string' },
                  timestamp: { type: 'string' },
                  uptime: { type: 'number' },
                  database: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      let dbStatus = 'unknown';

      try {
        // Check database connectivity
        await db.$queryRaw`SELECT 1`;
        dbStatus = 'connected';
      } catch {
        dbStatus = 'disconnected';
      }

      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        data: {
          status: 'healthy',
          version: process.env.npm_package_version || '1.0.0',
          build: process.env.GIT_COMMIT || 'unknown',
          timestamp: new Date().toISOString(),
          uptime: uptimeSeconds,
          database: dbStatus,
        },
      };
    }
  );

  /**
   * Readiness check
   */
  app.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness check',
        description: 'Returns 200 if service is ready to accept requests',
        response: {
          200: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
            },
          },
          503: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await db.$queryRaw`SELECT 1`;
        return { ready: true };
      } catch (error) {
        reply.status(503);
        return { ready: false, error: 'Database not available' };
      }
    }
  );
}
