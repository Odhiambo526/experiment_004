// Token Identity Verification - Authentication Tests (Milestone 2)
// Tests for API key authentication and admin token protection

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../app.js';
import { db } from '../lib/db.js';
import { generateApiKey, verifyApiKey } from '../lib/auth.js';
import type { FastifyInstance } from 'fastify';

describe('Authentication (Milestone 2)', () => {
  let app: FastifyInstance;
  
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  describe('API Key Generation', () => {
    it('should generate API keys with correct format', async () => {
      const { plaintext, hash, prefix } = await generateApiKey();
      
      // Key should start with tvk_
      expect(plaintext).toMatch(/^tvk_[A-Za-z0-9_-]+$/);
      
      // Prefix should be first 12 chars (tvk_ + 8 chars)
      expect(prefix).toBe(plaintext.substring(0, 12));
      expect(prefix.length).toBe(12);
      
      // Hash should be present and not equal to plaintext
      expect(hash).toBeDefined();
      expect(hash).not.toBe(plaintext);
      
      // Hash should be argon2 format
      expect(hash).toMatch(/^\$argon2id\$/);
    });
    
    it('should verify valid API keys', async () => {
      const { plaintext, hash } = await generateApiKey();
      
      const isValid = await verifyApiKey(plaintext, hash);
      expect(isValid).toBe(true);
    });
    
    it('should reject invalid API keys', async () => {
      const { hash } = await generateApiKey();
      
      const isValid = await verifyApiKey('tvk_wrongkey', hash);
      expect(isValid).toBe(false);
    });
    
    it('should reject malformed keys', async () => {
      const { hash } = await generateApiKey();
      
      const isValid = await verifyApiKey('not-an-api-key', hash);
      expect(isValid).toBe(false);
    });
  });
  
  describe('Write Endpoint Protection', () => {
    it('should return 401 for POST /v1/projects without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: {
          displayName: 'Test Project',
        },
      });
      
      // Should return 401 or 404 (if ADMIN_TOKEN not set)
      expect([401, 404]).toContain(response.statusCode);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });
    
    it('should return 401 for POST /v1/tokens without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tokens',
        payload: {
          projectId: 'test-project',
          chainId: 1,
          contractAddress: '0x1234567890123456789012345678901234567890',
          symbol: 'TEST',
          name: 'Test Token',
        },
      });
      
      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
    
    it('should return 401 for POST /v1/verification/requests without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/verification/requests',
        payload: {
          tokenId: 'test-token',
        },
      });
      
      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
    
    it('should return 401 for POST /v1/proofs/signature without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/proofs/signature',
        payload: {
          verificationRequestId: 'test-request',
          signature: '0x' + '0'.repeat(130),
        },
      });
      
      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
    
    it('should return 401 for POST /v1/proofs/dns without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/proofs/dns',
        payload: {
          verificationRequestId: 'test-request',
          domain: 'example.com',
        },
      });
      
      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
    
    it('should return 401 for POST /v1/proofs/github without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/proofs/github',
        payload: {
          verificationRequestId: 'test-request',
          owner: 'test-org',
          repo: 'test-repo',
        },
      });
      
      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });
  
  describe('Public Endpoint Access', () => {
    it('should allow GET /v1/status without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/status',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('healthy');
    });
    
    it('should allow GET /v1/keys without auth (database may not be available)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/keys',
      });
      
      // 200 if database available, 500 if not (in test environment)
      // Both indicate the endpoint is public (no 401)
      expect([200, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(401);
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      }
    });
    
    it('should allow GET /v1/tokens search without auth (database may not be available)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tokens?symbol=TEST',
      });
      
      // 200 if database available, 500 if not (in test environment)
      // Both indicate the endpoint is public (no 401)
      expect([200, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(401);
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      }
    });
  });
  
  describe('Auth Status Endpoint', () => {
    it('should return auth status without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/status',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.authenticated).toBe(false);
      expect(body.data.authType).toBe('none');
    });
  });
  
  describe('Admin Endpoint Protection', () => {
    it('should return 404 or 401 for admin endpoints without ADMIN_TOKEN', async () => {
      // The response depends on whether ADMIN_TOKEN is set
      const response = await app.inject({
        method: 'POST',
        url: '/v1/projects/test-project/api-keys',
        payload: {
          name: 'Test Key',
        },
      });
      
      // Should return 401 (unauthorized) or 404 (not found if ADMIN_TOKEN not set)
      expect([401, 404]).toContain(response.statusCode);
    });
    
    it('should return 404 or 401 for api key listing without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/projects/test-project/api-keys',
      });
      
      expect([401, 404]).toContain(response.statusCode);
    });
    
    it('should return 404 or 401 for api key revocation without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/api-keys/test-key/revoke',
      });
      
      expect([401, 404]).toContain(response.statusCode);
    });
  });
  
  describe('Error Response Format', () => {
    it('should return standardized 401 error format', async () => {
      // Test with a valid payload to ensure we get 401 (auth check) not 400 (validation)
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tokens',
        payload: {
          projectId: 'test-project',
          chainId: 1,
          contractAddress: '0x1234567890123456789012345678901234567890',
          symbol: 'TEST',
          name: 'Test Token',
        },
      });
      
      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: expect.any(String),
        },
      });
    });
  });
});

describe('Health Endpoint (Milestone 2 Enhancements)', () => {
  let app: FastifyInstance;
  
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  it('should include build info in /v1/status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/status',
    });
    
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.data).toMatchObject({
      status: 'healthy',
      version: expect.any(String),
      build: expect.any(String),
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      database: expect.any(String),
    });
  });
  
  it('should have non-negative uptime', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/status',
    });
    
    const body = JSON.parse(response.body);
    expect(body.data.uptime).toBeGreaterThanOrEqual(0);
  });
});
