// Token Identity Verification - Signature Verifier Tests
// Unit tests for EIP-191 signature verification

import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';
import {
  generateSigningMessage,
  generateNonce,
  APP_DOMAIN,
} from '@token-verify/shared';

// Mock the signature verification logic for testing
describe('Signature Verification', () => {
  const testChainId = 1;
  const testContractAddress = '0x1234567890123456789012345678901234567890';
  const testNonce = generateNonce();
  const testTimestamp = Date.now();
  const testRequestId = 'test_request_123';

  describe('generateSigningMessage', () => {
    it('should generate a valid signing message', () => {
      const message = generateSigningMessage({
        domain: APP_DOMAIN,
        chainId: testChainId,
        contractAddress: testContractAddress,
        timestamp: testTimestamp,
        nonce: testNonce,
        requestId: testRequestId,
      });

      expect(message).toContain(APP_DOMAIN);
      expect(message).toContain(testChainId.toString());
      expect(message).toContain(testContractAddress);
      expect(message).toContain(testNonce);
      expect(message).toContain(testRequestId);
      expect(message).toContain('I am the controller of this token contract');
    });

    it('should include security statement in message', () => {
      const message = generateSigningMessage({
        domain: APP_DOMAIN,
        chainId: testChainId,
        contractAddress: testContractAddress,
        timestamp: testTimestamp,
        nonce: testNonce,
        requestId: testRequestId,
      });

      expect(message).toContain('verification does not grant exclusive rights');
    });
  });

  describe('EIP-191 signature verification', () => {
    it('should recover the correct address from a valid signature', async () => {
      // Create a test wallet
      const wallet = ethers.Wallet.createRandom();
      const message = generateSigningMessage({
        domain: APP_DOMAIN,
        chainId: testChainId,
        contractAddress: testContractAddress,
        timestamp: testTimestamp,
        nonce: testNonce,
        requestId: testRequestId,
      });

      // Sign the message
      const signature = await wallet.signMessage(message);

      // Recover the address
      const recoveredAddress = ethers.verifyMessage(message, signature);

      expect(recoveredAddress.toLowerCase()).toBe(wallet.address.toLowerCase());
    });

    it('should reject an invalid signature', () => {
      const message = 'Test message';
      const invalidSignature = '0x' + '00'.repeat(65);

      expect(() => {
        ethers.verifyMessage(message, invalidSignature);
      }).toThrow();
    });

    it('should detect signature for wrong message', async () => {
      const wallet = ethers.Wallet.createRandom();
      const message1 = 'Message 1';
      const message2 = 'Message 2';

      const signature = await wallet.signMessage(message1);
      const recoveredAddress = ethers.verifyMessage(message2, signature);

      // The recovered address will be different (not the signer's address)
      expect(recoveredAddress.toLowerCase()).not.toBe(wallet.address.toLowerCase());
    });
  });

  describe('Nonce generation', () => {
    it('should generate unique nonces', () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce());
      }
      expect(nonces.size).toBe(100);
    });

    it('should generate nonces of correct length', () => {
      const nonce = generateNonce(32);
      expect(nonce).toHaveLength(64); // 32 bytes = 64 hex characters
    });

    it('should only contain hex characters', () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[a-f0-9]+$/);
    });
  });
});

describe('Contract Address Validation', () => {
  it('should validate correct Ethereum addresses', () => {
    const validAddresses = [
      '0x0000000000000000000000000000000000000000',
      '0xdead000000000000000000000000000000000000',
      '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF',
    ];

    for (const addr of validAddresses) {
      expect(ethers.isAddress(addr)).toBe(true);
    }
  });

  it('should reject invalid addresses', () => {
    const invalidAddresses = [
      '0x0', // Too short
      '0x00000000000000000000000000000000000000000', // Too long
      '0xZZZZ000000000000000000000000000000000000', // Invalid characters
      'not an address',
    ];

    for (const addr of invalidAddresses) {
      expect(ethers.isAddress(addr)).toBe(false);
    }
  });
});
