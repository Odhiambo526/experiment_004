// Token Identity Verification API - App Builder
// Configures Fastify with all plugins, middleware, and routes

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { errorHandler } from './lib/error-handler.js';
import { registerAuthMiddleware } from './lib/auth.js';

// Route imports
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { tokenRoutes } from './routes/tokens.js';
import { verificationRoutes } from './routes/verification.js';
import { proofRoutes } from './routes/proofs.js';
import { attestationRoutes } from './routes/attestations.js';
import { keysRoutes } from './routes/keys.js';
import { publicRoutes } from './routes/public.js';
import { devRoutes } from './routes/dev.js';
import { apiKeyRoutes } from './routes/api-keys.js';

const isDev = process.env.NODE_ENV === 'development';
const GIT_COMMIT = process.env.GIT_COMMIT || 'unknown';

export async function buildApp() {
  const app = Fastify({
    logger: isDev
      ? {
          level: process.env.LOG_LEVEL || 'debug',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
          // Redact sensitive headers from logs
          redact: {
            paths: ['req.headers.authorization', 'req.headers["x-api-key"]'],
            censor: '[REDACTED]',
          },
        }
      : {
          level: process.env.LOG_LEVEL || 'info',
          // Redact sensitive headers from logs
          redact: {
            paths: ['req.headers.authorization', 'req.headers["x-api-key"]'],
            censor: '[REDACTED]',
          },
        },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for API
  });

  // CORS configuration
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100, // requests
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later',
      },
    }),
  });

  // API documentation
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Token Identity Verification API',
        description: `
          A reputation/attestation layer for disambiguating tokens that share the same ticker.
          
          **Important**: We do NOT claim global ticker uniqueness. We verify identity assertions
          tied to a specific (chain_id, contract_address) pair. Multiple tokens can share the
          same symbol; only verified ones receive verification badges.
          
          **Authentication**: Write endpoints require an API key. Admin endpoints require the ADMIN_TOKEN.
          Pass the token in the Authorization header: \`Authorization: Bearer <token>\`
        `,
        version: '1.0.0',
      },
      servers: [
        {
          url: process.env.API_URL || 'http://localhost:3001',
          description: 'API Server',
        },
      ],
      tags: [
        { name: 'Health', description: 'Service health endpoints' },
        { name: 'Public', description: 'Public read-only endpoints for integrators' },
        { name: 'Projects', description: 'Project management (requires auth)' },
        { name: 'Tokens', description: 'Token registration (requires auth)' },
        { name: 'Verification', description: 'Verification request workflow (requires auth)' },
        { name: 'Proofs', description: 'Proof submission and validation (requires auth)' },
        { name: 'Attestations', description: 'Signed attestations (public read)' },
        { name: 'Keys', description: 'Public keys for signature verification' },
        { name: 'API Keys', description: 'API key management (admin only)' },
        { name: 'Dev', description: 'Development-only endpoints' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'API key (starts with tvk_) or admin token',
          },
        },
      },
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Error handling
  app.setErrorHandler(errorHandler);

  // Authentication middleware (attaches auth context to all requests)
  await registerAuthMiddleware(app);

  // Register routes
  // Public routes (no auth required)
  await app.register(healthRoutes, { prefix: '/v1' });
  await app.register(publicRoutes, { prefix: '/v1' });
  await app.register(keysRoutes, { prefix: '/v1/keys' });
  await app.register(attestationRoutes, { prefix: '/v1/attestations' });
  
  // Protected routes (auth required - enforced in route handlers)
  await app.register(projectRoutes, { prefix: '/v1/projects' });
  await app.register(tokenRoutes, { prefix: '/v1/tokens' });
  await app.register(verificationRoutes, { prefix: '/v1/verification' });
  await app.register(proofRoutes, { prefix: '/v1/proofs' });
  
  // Admin routes (admin token required)
  await app.register(apiKeyRoutes, { prefix: '/v1' });
  
  // Dev routes (DEV_MODE only)
  await app.register(devRoutes, { prefix: '/v1' });

  return app;
}
