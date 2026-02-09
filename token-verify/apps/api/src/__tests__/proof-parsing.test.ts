// Token Identity Verification - Proof Parsing Tests
// Unit tests for DNS and GitHub proof parsing

import { describe, it, expect } from 'vitest';
import {
  generateDnsRecord,
  generateGitHubProofContent,
  parseDnsRecord,
  parseGitHubProof,
  generateNonce,
  PROOF_CONSTANTS,
} from '@token-verify/shared';

describe('DNS Proof Parsing', () => {
  const testRequestId = 'test_request_abc123';
  const testNonce = generateNonce();

  describe('generateDnsRecord', () => {
    it('should generate a valid DNS record format', () => {
      const record = generateDnsRecord(testRequestId, testNonce);
      
      expect(record).toBe(`tokenverif:v1:${testRequestId}:${testNonce}`);
      // Request ID can contain alphanumerics and underscores, nonce is hex
      expect(record).toMatch(/^tokenverif:v1:[a-zA-Z0-9_]+:[a-fA-F0-9]+$/);
    });
  });

  describe('parseDnsRecord', () => {
    it('should parse a valid DNS record', () => {
      const record = generateDnsRecord(testRequestId, testNonce);
      const parsed = parseDnsRecord(record);

      expect(parsed).not.toBeNull();
      expect(parsed?.requestId).toBe(testRequestId);
      expect(parsed?.nonce).toBe(testNonce);
    });

    it('should return null for invalid format', () => {
      const invalidRecords = [
        'invalid',
        'tokenverif:v2:id:nonce', // Wrong version
        'tokenverif:v1:id', // Missing nonce
        'tokenverif:v1:', // Empty values
        'tokenverif:v1:id:nonce:extra', // Extra parts
        '', // Empty string
      ];

      for (const record of invalidRecords) {
        expect(parseDnsRecord(record)).toBeNull();
      }
    });

    it('should be case sensitive', () => {
      const record = 'TOKENVERIF:v1:id:nonce';
      expect(parseDnsRecord(record)).toBeNull();
    });
  });
});

describe('GitHub Proof Parsing', () => {
  const testRequestId = 'test_request_xyz789';
  const testNonce = generateNonce();

  describe('generateGitHubProofContent', () => {
    it('should generate valid GitHub proof content', () => {
      const content = generateGitHubProofContent(testRequestId, testNonce);
      
      expect(content).toBe(`tokenverif:v1:${testRequestId}:${testNonce}`);
    });
  });

  describe('parseGitHubProof', () => {
    it('should parse valid GitHub proof content', () => {
      const content = generateGitHubProofContent(testRequestId, testNonce);
      const parsed = parseGitHubProof(content);

      expect(parsed).not.toBeNull();
      expect(parsed?.requestId).toBe(testRequestId);
      expect(parsed?.nonce).toBe(testNonce);
    });

    it('should handle whitespace', () => {
      const content = `  tokenverif:v1:${testRequestId}:${testNonce}  \n`;
      const parsed = parseGitHubProof(content);

      expect(parsed).not.toBeNull();
      expect(parsed?.requestId).toBe(testRequestId);
    });

    it('should return null for invalid content', () => {
      const invalidContents = [
        'some random content',
        'tokenverif:v1:',
        '{}', // JSON
        '<html>', // HTML
      ];

      for (const content of invalidContents) {
        expect(parseGitHubProof(content)).toBeNull();
      }
    });
  });
});

describe('Proof Constants', () => {
  it('should have valid DNS subdomain', () => {
    expect(PROOF_CONSTANTS.DNS_SUBDOMAIN).toBe('token-verify');
    expect(PROOF_CONSTANTS.DNS_SUBDOMAIN).not.toContain('.');
  });

  it('should have valid GitHub well-known path', () => {
    expect(PROOF_CONSTANTS.GITHUB_WELL_KNOWN_PATH).toBe('.well-known/tokenverif.txt');
    expect(PROOF_CONSTANTS.GITHUB_WELL_KNOWN_PATH.startsWith('.well-known/')).toBe(true);
  });

  it('should have reasonable proof age limits', () => {
    expect(PROOF_CONSTANTS.PROOF_MAX_AGE_DAYS).toBeGreaterThan(0);
    expect(PROOF_CONSTANTS.PROOF_MAX_AGE_DAYS).toBeLessThanOrEqual(90);
  });

  it('should have reasonable failure thresholds', () => {
    expect(PROOF_CONSTANTS.MAX_CONSECUTIVE_FAILURES).toBeGreaterThan(0);
    expect(PROOF_CONSTANTS.MAX_CONSECUTIVE_FAILURES).toBeLessThanOrEqual(10);
  });
});

describe('Round-trip Verification', () => {
  it('should successfully round-trip DNS proof data', () => {
    const requestId = 'req_' + generateNonce(16);
    const nonce = generateNonce();

    // Generate
    const record = generateDnsRecord(requestId, nonce);

    // Parse
    const parsed = parseDnsRecord(record);

    // Verify round-trip
    expect(parsed).not.toBeNull();
    expect(parsed?.requestId).toBe(requestId);
    expect(parsed?.nonce).toBe(nonce);
  });

  it('should successfully round-trip GitHub proof data', () => {
    const requestId = 'req_' + generateNonce(16);
    const nonce = generateNonce();

    // Generate
    const content = generateGitHubProofContent(requestId, nonce);

    // Parse
    const parsed = parseGitHubProof(content);

    // Verify round-trip
    expect(parsed).not.toBeNull();
    expect(parsed?.requestId).toBe(requestId);
    expect(parsed?.nonce).toBe(nonce);
  });
});
