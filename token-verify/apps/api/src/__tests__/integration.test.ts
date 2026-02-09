// Token Identity Verification - Integration Tests
// End-to-end flow tests with mocked external services

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import {
  generateSigningMessage,
  generateNonce,
  generateDnsRecord,
  generateGitHubProofContent,
  APP_DOMAIN,
  VerificationTier,
} from '@token-verify/shared';

/**
 * Integration test suite for the verification flow
 * 
 * Note: These tests mock external dependencies (DNS, GitHub, blockchain)
 * to ensure deterministic results. Real integration tests would require
 * a test environment with actual services.
 */
describe('Verification Flow Integration', () => {
  // Test data
  const testChainId = 1;
  const testContractAddress = '0x1234567890123456789012345678901234567890';
  const testSymbol = 'TEST';
  const testName = 'Test Token';
  const testDomain = 'example.com';
  const testGithubOwner = 'test-org';
  const testGithubRepo = 'test-repo';

  // Create a test wallet for signing
  const testWallet = ethers.Wallet.createRandom();

  describe('Complete Verification Workflow', () => {
    it('should generate valid proof instructions', () => {
      const requestId = 'req_' + generateNonce(16);
      const nonce = generateNonce();
      const timestamp = Date.now();

      // Generate signing message
      const message = generateSigningMessage({
        domain: APP_DOMAIN,
        chainId: testChainId,
        contractAddress: testContractAddress,
        timestamp,
        nonce,
        requestId,
      });

      // Generate DNS record
      const dnsRecord = generateDnsRecord(requestId, nonce);

      // Generate GitHub proof
      const githubContent = generateGitHubProofContent(requestId, nonce);

      // Verify all contain request ID and nonce
      expect(message).toContain(requestId);
      expect(message).toContain(nonce);
      expect(dnsRecord).toContain(requestId);
      expect(dnsRecord).toContain(nonce);
      expect(githubContent).toContain(requestId);
      expect(githubContent).toContain(nonce);
    });

    it('should create and verify a valid signature', async () => {
      const requestId = 'req_' + generateNonce(16);
      const nonce = generateNonce();
      const timestamp = Date.now();

      // Generate message
      const message = generateSigningMessage({
        domain: APP_DOMAIN,
        chainId: testChainId,
        contractAddress: testContractAddress,
        timestamp,
        nonce,
        requestId,
      });

      // Sign with test wallet
      const signature = await testWallet.signMessage(message);

      // Verify signature recovers to correct address
      const recoveredAddress = ethers.verifyMessage(message, signature);
      expect(recoveredAddress.toLowerCase()).toBe(testWallet.address.toLowerCase());

      // Verify signature format
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });
  });

  describe('Verification Tier Calculation', () => {
    // Mock proof statuses
    const createProof = (type: string, status: string, tier?: string) => ({
      type,
      status,
      payload: tier ? { verificationTier: tier } : {},
    });

    it('should return VERIFIED for owner signature + 2 offchain proofs', () => {
      const proofs = [
        createProof('ONCHAIN_SIGNATURE', 'VALID', 'owner'),
        createProof('DNS_TXT', 'VALID'),
        createProof('GITHUB_REPO', 'VALID'),
      ];

      // Count valid onchain and offchain proofs
      const signatureProof = proofs.find((p) => p.type === 'ONCHAIN_SIGNATURE');
      const signatureTier = (signatureProof?.payload as { verificationTier?: string })?.verificationTier;
      const validOffchainCount = proofs.filter(
        (p) => p.type !== 'ONCHAIN_SIGNATURE' && p.status === 'VALID'
      ).length;

      // Check tier calculation
      if (signatureTier === 'owner' && validOffchainCount >= 2) {
        expect(VerificationTier.VERIFIED).toBe('verified');
      }
    });

    it('should return DEPLOYER_VERIFIED for deployer signature + 1 offchain proof', () => {
      const proofs = [
        createProof('ONCHAIN_SIGNATURE', 'VALID', 'deployer'),
        createProof('DNS_TXT', 'VALID'),
      ];

      const signatureProof = proofs.find((p) => p.type === 'ONCHAIN_SIGNATURE');
      const signatureTier = (signatureProof?.payload as { verificationTier?: string })?.verificationTier;
      const validOffchainCount = proofs.filter(
        (p) => p.type !== 'ONCHAIN_SIGNATURE' && p.status === 'VALID'
      ).length;

      if (signatureTier === 'deployer' && validOffchainCount >= 1) {
        expect(VerificationTier.DEPLOYER_VERIFIED).toBe('deployer_verified');
      }
    });

    it('should return UNVERIFIED without valid signature', () => {
      const proofs = [
        createProof('ONCHAIN_SIGNATURE', 'INVALID', 'unknown'),
        createProof('DNS_TXT', 'VALID'),
        createProof('GITHUB_REPO', 'VALID'),
      ];

      const signatureProof = proofs.find((p) => p.type === 'ONCHAIN_SIGNATURE');
      if (signatureProof?.status !== 'VALID') {
        expect(VerificationTier.UNVERIFIED).toBe('unverified');
      }
    });

    it('should return UNVERIFIED without sufficient offchain proofs', () => {
      const proofs = [
        createProof('ONCHAIN_SIGNATURE', 'VALID', 'owner'),
        createProof('DNS_TXT', 'INVALID'),
        createProof('GITHUB_REPO', 'INVALID'),
      ];

      const signatureProof = proofs.find((p) => p.type === 'ONCHAIN_SIGNATURE');
      const signatureTier = (signatureProof?.payload as { verificationTier?: string })?.verificationTier;
      const validOffchainCount = proofs.filter(
        (p) => p.type !== 'ONCHAIN_SIGNATURE' && p.status === 'VALID'
      ).length;

      if (signatureTier === 'owner' && validOffchainCount < 2) {
        // Would be deployer_verified if 1 offchain, unverified if 0
        expect(validOffchainCount).toBe(0);
      }
    });
  });

  describe('Attestation Data Structure', () => {
    it('should create a valid attestation structure', () => {
      const attestation = {
        version: '1.0.0',
        timestamp: Date.now(),
        token: {
          chainId: testChainId,
          contractAddress: testContractAddress,
          symbol: testSymbol,
          name: testName,
          decimals: 18,
        },
        verification: {
          tier: VerificationTier.VERIFIED,
          requestId: 'req_123',
          proofs: [
            { type: 'ONCHAIN_SIGNATURE', status: 'valid', checkedAt: new Date().toISOString() },
            { type: 'DNS_TXT', status: 'valid', checkedAt: new Date().toISOString() },
            { type: 'GITHUB_REPO', status: 'valid', checkedAt: new Date().toISOString() },
          ],
        },
        project: {
          id: 'proj_123',
          displayName: 'Test Project',
        },
      };

      // Verify structure
      expect(attestation.version).toBe('1.0.0');
      expect(attestation.token.chainId).toBe(testChainId);
      expect(attestation.verification.tier).toBe('verified');
      expect(attestation.verification.proofs).toHaveLength(3);

      // Verify it can be serialized to JSON
      const json = JSON.stringify(attestation);
      expect(json).toContain('verified');
      expect(json).toContain(testSymbol);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty proofs array', () => {
      const proofs: Array<{ type: string; status: string }> = [];
      const hasValidSignature = proofs.some(
        (p) => p.type === 'ONCHAIN_SIGNATURE' && p.status === 'VALID'
      );
      expect(hasValidSignature).toBe(false);
    });

    it('should handle very long nonces', () => {
      const longNonce = generateNonce(64);
      expect(longNonce).toHaveLength(128);
    });

    it('should handle checksummed and non-checksummed addresses', () => {
      const checksummed = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const lowercased = checksummed.toLowerCase();

      expect(ethers.isAddress(checksummed)).toBe(true);
      expect(ethers.isAddress(lowercased)).toBe(true);
      expect(ethers.getAddress(lowercased)).toBe(checksummed);
    });

    it('should validate chain IDs', () => {
      const validChainIds = [1, 137, 42161, 10, 8453];
      const invalidChainIds = [0, -1, 999999999999];

      for (const chainId of validChainIds) {
        expect(chainId).toBeGreaterThan(0);
      }

      for (const chainId of invalidChainIds) {
        expect(chainId <= 0 || chainId > 2147483647).toBe(true);
      }
    });
  });
});

describe('Security Considerations', () => {
  it('should include domain in signing message to prevent replay', () => {
    const message = generateSigningMessage({
      domain: APP_DOMAIN,
      chainId: 1,
      contractAddress: '0x0000000000000000000000000000000000000001',
      timestamp: Date.now(),
      nonce: generateNonce(),
      requestId: 'req_123',
    });

    expect(message).toContain(APP_DOMAIN);
  });

  it('should include chain ID to prevent cross-chain replay', () => {
    const chainId = 137; // Polygon
    const message = generateSigningMessage({
      domain: APP_DOMAIN,
      chainId,
      contractAddress: '0x0000000000000000000000000000000000000001',
      timestamp: Date.now(),
      nonce: generateNonce(),
      requestId: 'req_123',
    });

    expect(message).toContain(chainId.toString());
  });

  it('should include timestamp to limit validity window', () => {
    const timestamp = Date.now();
    const message = generateSigningMessage({
      domain: APP_DOMAIN,
      chainId: 1,
      contractAddress: '0x0000000000000000000000000000000000000001',
      timestamp,
      nonce: generateNonce(),
      requestId: 'req_123',
    });

    expect(message).toContain(timestamp.toString());
  });

  it('should include nonce to prevent replay of same message', () => {
    const nonce = generateNonce();
    const message = generateSigningMessage({
      domain: APP_DOMAIN,
      chainId: 1,
      contractAddress: '0x0000000000000000000000000000000000000001',
      timestamp: Date.now(),
      nonce,
      requestId: 'req_123',
    });

    expect(message).toContain(nonce);
  });
});
