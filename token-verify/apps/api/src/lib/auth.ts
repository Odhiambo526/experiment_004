// Token Identity Verification - Authentication Middleware
// API key and admin token authentication for Milestone 2

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { db } from './db.js';
import { Errors } from './error-handler.js';
import { logger } from './logger.js';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const API_KEY_PREFIX = 'tvk_'; // Token Verify Key

/**
 * Authentication context attached to requests
 */
export interface AuthContext {
  type: 'api_key' | 'admin' | 'none';
  projectId?: string;
  apiKeyId?: string;
}

/**
 * Extended FastifyRequest with auth context
 */
export interface AuthenticatedRequest extends FastifyRequest {
  auth: AuthContext;
}

/**
 * Generate a new API key
 * Returns the plaintext key (only available once) and the hash for storage
 */
export async function generateApiKey(): Promise<{
  plaintext: string;
  hash: string;
  prefix: string;
}> {
  // Generate 32 random bytes (256 bits of entropy)
  const keyBytes = randomBytes(32);
  const keyBase64 = keyBytes.toString('base64url');
  const plaintext = `${API_KEY_PREFIX}${keyBase64}`;
  
  // Hash with argon2
  const hash = await argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
  
  // Prefix for identification (first 8 chars after tvk_)
  const prefix = plaintext.substring(0, 12); // tvk_ + 8 chars
  
  return { plaintext, hash, prefix };
}

/**
 * Verify an API key against a stored hash
 */
export async function verifyApiKey(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Validate API key and return auth context
 */
async function validateApiKey(token: string): Promise<AuthContext | null> {
  // Check if it looks like an API key
  if (!token.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  
  // Find all non-revoked, non-expired keys and check against hash
  // This is somewhat expensive but necessary since we can't look up by plaintext
  // In production, consider using key prefix index for faster lookup
  const prefix = token.substring(0, 12);
  
  const candidates = await db.apiKey.findMany({
    where: {
      keyPrefix: prefix,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
  
  for (const candidate of candidates) {
    const isValid = await verifyApiKey(token, candidate.keyHash);
    if (isValid) {
      // Update last used timestamp (fire and forget)
      db.apiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      }).catch((err) => {
        logger.warn({ err, apiKeyId: candidate.id }, 'Failed to update lastUsedAt');
      });
      
      return {
        type: 'api_key',
        projectId: candidate.projectId,
        apiKeyId: candidate.id,
      };
    }
  }
  
  return null;
}

/**
 * Check if token is the admin token
 */
function isAdminToken(token: string): boolean {
  if (!ADMIN_TOKEN) return false;
  // Use timing-safe comparison
  if (token.length !== ADMIN_TOKEN.length) return false;
  
  let result = 0;
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ ADMIN_TOKEN.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Authentication middleware - attaches auth context to request
 * Does NOT enforce authentication - use requireAuth or requireAdmin for that
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const req = request as AuthenticatedRequest;
  req.auth = { type: 'none' };
  
  const token = extractBearerToken(request);
  if (!token) return;
  
  // Check admin token first
  if (isAdminToken(token)) {
    req.auth = { type: 'admin' };
    return;
  }
  
  // Check API key
  const apiKeyAuth = await validateApiKey(token);
  if (apiKeyAuth) {
    req.auth = apiKeyAuth;
  }
}

/**
 * Require API key authentication
 * Can optionally require the key to belong to a specific project
 */
export function requireAuth(opts?: { projectId?: string }) {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    const req = request as AuthenticatedRequest;
    
    if (!req.auth || req.auth.type === 'none') {
      throw Errors.unauthorized('API key required');
    }
    
    // Admin token has access to everything
    if (req.auth.type === 'admin') {
      return;
    }
    
    // If specific project required, check it matches
    if (opts?.projectId && req.auth.projectId !== opts.projectId) {
      throw Errors.forbidden('API key does not have access to this project');
    }
  };
}

/**
 * Require admin token authentication
 * Returns 404 if ADMIN_TOKEN is not configured (hides admin endpoints)
 */
export function requireAdmin() {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    // If ADMIN_TOKEN not configured, pretend endpoint doesn't exist
    if (!ADMIN_TOKEN) {
      reply.status(404);
      throw Errors.notFound('Endpoint');
    }
    
    const req = request as AuthenticatedRequest;
    
    if (!req.auth || req.auth.type !== 'admin') {
      throw Errors.unauthorized('Admin token required');
    }
  };
}

/**
 * Check if admin endpoints are enabled
 */
export function isAdminEnabled(): boolean {
  return Boolean(ADMIN_TOKEN);
}

/**
 * Register auth middleware on a Fastify instance
 */
export async function registerAuthMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
}
