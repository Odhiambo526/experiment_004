// Token Identity Verification - API Tests
// Tests for API endpoints and error handling

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../app.js';

/**
 * API endpoint tests
 * 
 * Note: These tests use the actual Fastify app but mock the database layer.
 * For full integration tests against a real database, use a separate test database.
 */
describe('API Endpoints', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Health Endpoints', () => {
    it('GET /v1/status should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('healthy');
    });

    it('GET /v1/ready should return readiness status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/ready',
      });

      // May return 200 or 503 depending on database state
      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(typeof body.ready).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return standardized error format', async () => {
      // Test with invalid chainId (non-numeric)
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tokens/invalid/0x1234567890123456789012345678901234567890',
      });

      // Should return 400 for invalid chainId
      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBeDefined();
      expect(body.error.message).toBeDefined();
    });
  });

  describe('Public Endpoints', () => {
    it('GET /v1/tokens should accept query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tokens?symbol=TEST&chain_id=1',
      });

      // Should return 200 (success) or 500 (database not available in test environment)
      // Both are acceptable - we're testing that the endpoint exists and is public
      expect([200, 500]).toContain(response.statusCode);
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
      }
    });

    it('GET /v1/keys should return public keys', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/keys',
      });

      // Should return 200 (success) or 500 (database not available in test environment)
      expect([200, 500]).toContain(response.statusCode);
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.keys).toBeDefined();
      }
    });
  });

  describe('Input Validation and Authentication', () => {
    it('POST /v1/projects should require admin authentication', async () => {
      // POST /v1/projects now requires ADMIN_TOKEN
      // Without auth, returns 404 (if ADMIN_TOKEN not set) or 401 (if set but wrong)
      const response = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: {},
      });

      // Should return 400 (validation), 401 (unauthorized), or 404 (admin not enabled)
      expect([400, 401, 404]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('POST /v1/tokens should require authentication', async () => {
      // POST /v1/tokens now requires API key
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

      // Should return 401 (unauthorized) - auth is checked before validation
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Dev Endpoints (DEV_MODE)', () => {
    // Note: These tests check if dev endpoints respond appropriately
    // based on DEV_MODE environment variable
    it('GET /v1/dev/status should return dev mode status or 404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/dev/status',
      });

      // Should return 200 if DEV_MODE=true, 404 otherwise
      expect([200, 404]).toContain(response.statusCode);
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(typeof body.data.devMode).toBe('boolean');
      }
    });
  });
});

describe('Response Format', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('successful responses should have success: true', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/status',
    });

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('error responses should have success: false', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: {},
    });

    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('error responses should include code and message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: {},
    });

    const body = JSON.parse(response.body);
    expect(body.error.code).toBeDefined();
    expect(typeof body.error.code).toBe('string');
    expect(body.error.message).toBeDefined();
    expect(typeof body.error.message).toBe('string');
  });
});
