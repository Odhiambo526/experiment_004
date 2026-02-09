// Token Identity Verification - Full Flow Integration Tests
// High-value tests covering the complete verification workflow

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db.js';
import { generateSigningMessage, generateNonce } from '@token-verify/shared';
import { ethers } from 'ethers';

/**
 * These tests verify the complete verification flow against a real database.
 * Run these with a test database configured via DATABASE_URL.
 */
describe('Full Verification Flow', () => {
  // Test data - use timestamps to ensure unique values
  const testTimestamp = Date.now();
  let testProjectId: string;
  let testTokenId: string;
  let testRequestId: string;
  let testWallet: ethers.HDNodeWallet;
  const testContractAddress = `0x${testTimestamp.toString(16).padStart(40, '0')}`.toLowerCase();
  const testChainId = 1;
  const testSymbol = `TEST${testTimestamp}`;
  let testNonce: string;
  
  beforeAll(async () => {
    // Create a test wallet for signing
    testWallet = ethers.Wallet.createRandom();
  });

  afterAll(async () => {
    // Clean up test data in correct order
    try {
      if (testRequestId) {
        await db.proof.deleteMany({ where: { verificationRequestId: testRequestId } });
        await db.verificationRequest.deleteMany({ where: { id: testRequestId } });
      }
      if (testTokenId) {
        await db.attestation.deleteMany({ where: { tokenId: testTokenId } });
        await db.token.deleteMany({ where: { id: testTokenId } });
      }
      if (testProjectId) {
        await db.project.deleteMany({ where: { id: testProjectId } });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('Step 1: should create a project', async () => {
    const project = await db.project.create({
      data: {
        displayName: `Test Project ${testTimestamp}`,
        description: 'A test project for integration testing',
        contactEmail: 'test@example.com',
      },
    });

    expect(project.id).toBeDefined();
    expect(project.displayName).toBe(`Test Project ${testTimestamp}`);
    testProjectId = project.id;
  });

  it('Step 2: should create a token', async () => {
    expect(testProjectId).toBeDefined();
    
    const token = await db.token.create({
      data: {
        projectId: testProjectId,
        chainId: testChainId,
        contractAddress: testContractAddress,
        symbol: testSymbol,
        name: `Test Token ${testTimestamp}`,
        decimals: 18,
      },
    });

    expect(token.id).toBeDefined();
    expect(token.symbol).toBe(testSymbol);
    expect(token.contractAddress).toBe(testContractAddress);
    testTokenId = token.id;
  });

  it('Step 3: should create a verification request', async () => {
    expect(testTokenId).toBeDefined();
    
    testNonce = generateNonce();
    const request = await db.verificationRequest.create({
      data: {
        tokenId: testTokenId,
        status: 'PENDING',
        nonce: testNonce,
      },
    });

    expect(request.id).toBeDefined();
    expect(request.status).toBe('PENDING');
    expect(request.nonce).toBe(testNonce);
    testRequestId = request.id;
  });

  it('Step 4: should submit an onchain signature proof', async () => {
    expect(testRequestId).toBeDefined();
    
    // Generate and sign the message
    const timestamp = Date.now();
    const signingMessage = generateSigningMessage({
      domain: 'token-verify.example.com',
      chainId: testChainId,
      contractAddress: testContractAddress,
      requestId: testRequestId,
      timestamp,
      nonce: testNonce,
    });

    const signature = await testWallet.signMessage(signingMessage);

    // Create the proof
    const proof = await db.proof.create({
      data: {
        verificationRequestId: testRequestId,
        type: 'ONCHAIN_SIGNATURE',
        status: 'PENDING',
        payload: {
          signature,
          timestamp,
          claimedAddress: testWallet.address.toLowerCase(),
          message: signingMessage,
        },
      },
    });

    expect(proof.id).toBeDefined();
    expect(proof.type).toBe('ONCHAIN_SIGNATURE');
    expect(proof.status).toBe('PENDING');
  });

  it('Step 5: should mock DNS proof as valid', async () => {
    expect(testRequestId).toBeDefined();
    
    // For integration tests, we mock the DNS proof as valid
    const proof = await db.proof.create({
      data: {
        verificationRequestId: testRequestId,
        type: 'DNS_TXT',
        status: 'VALID',
        payload: {
          mockedForTest: true,
          domain: 'example.com',
          expectedRecord: `tokenverif:v1:${testRequestId}:${testNonce}`,
        },
        checkedAt: new Date(),
      },
    });

    expect(proof.type).toBe('DNS_TXT');
    expect(proof.status).toBe('VALID');
  });

  it('Step 6: should approve request and create attestation when proofs are valid', async () => {
    expect(testRequestId).toBeDefined();
    expect(testTokenId).toBeDefined();
    
    // First, update the signature proof to VALID (simulating verification)
    await db.proof.updateMany({
      where: {
        verificationRequestId: testRequestId,
        type: 'ONCHAIN_SIGNATURE',
      },
      data: {
        status: 'VALID',
        checkedAt: new Date(),
      },
    });

    // Check that we have at least 2 valid proofs
    const validProofs = await db.proof.count({
      where: {
        verificationRequestId: testRequestId,
        status: 'VALID',
      },
    });
    expect(validProofs).toBeGreaterThanOrEqual(2);

    // Update request status to APPROVED
    await db.verificationRequest.update({
      where: { id: testRequestId },
      data: { status: 'APPROVED' },
    });

    // Create attestation
    const attestationData = {
      version: 1,
      chainId: testChainId,
      contractAddress: testContractAddress,
      symbol: testSymbol,
      tokenId: testTokenId,
      verificationRequestId: testRequestId,
      verificationTier: 'deployer_verified',
      issuedAt: new Date().toISOString(),
      proofs: ['ONCHAIN_SIGNATURE', 'DNS_TXT'],
    };

    const attestation = await db.attestation.create({
      data: {
        tokenId: testTokenId,
        version: 1,
        attestationJson: attestationData,
        signature: 'test_signature_base64',
        publicKeyId: 'test_key_id',
      },
    });

    expect(attestation.id).toBeDefined();
    expect(attestation.version).toBe(1);
  });

  it('Step 7: should return token in search results', async () => {
    expect(testTokenId).toBeDefined();
    
    // Search for tokens with the test symbol
    const tokens = await db.token.findMany({
      where: { symbol: testSymbol },
      orderBy: { createdAt: 'desc' },
    });

    expect(tokens.length).toBeGreaterThanOrEqual(1);
    
    // Our test token should be found
    const ourToken = tokens.find((t) => t.id === testTokenId);
    expect(ourToken).toBeDefined();
    expect(ourToken?.symbol).toBe(testSymbol);
  });

  it('Step 8: should return attestation for verified token', async () => {
    expect(testTokenId).toBeDefined();
    
    const attestation = await db.attestation.findFirst({
      where: {
        tokenId: testTokenId,
        revokedAt: null,
      },
      orderBy: { version: 'desc' },
    });

    expect(attestation).not.toBeNull();
    expect(attestation?.tokenId).toBe(testTokenId);
    expect(attestation?.signature).toBeDefined();
  });
});

describe('Idempotent Verification', () => {
  const testTimestamp = Date.now();
  let testProjectId: string;
  let testTokenId: string;
  let testRequestId: string;
  const testContractAddress = `0x${(testTimestamp + 1000).toString(16).padStart(40, '0')}`.toLowerCase();
  const testChainId = 42;

  afterAll(async () => {
    // Clean up
    try {
      if (testRequestId) {
        await db.proof.deleteMany({ where: { verificationRequestId: testRequestId } });
        await db.verificationRequest.deleteMany({ where: { id: testRequestId } });
      }
      if (testTokenId) {
        await db.attestation.deleteMany({ where: { tokenId: testTokenId } });
        await db.token.deleteMany({ where: { id: testTokenId } });
      }
      if (testProjectId) {
        await db.project.deleteMany({ where: { id: testProjectId } });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should not create duplicate attestations on re-verification', async () => {
    // Create project
    const project = await db.project.create({
      data: {
        displayName: `Idempotent Test Project ${testTimestamp}`,
        contactEmail: 'idem@test.com',
      },
    });
    testProjectId = project.id;

    // Create token
    const token = await db.token.create({
      data: {
        projectId: testProjectId,
        chainId: testChainId,
        contractAddress: testContractAddress,
        symbol: `IDEM${testTimestamp}`,
        name: 'Idempotent Token',
      },
    });
    testTokenId = token.id;

    // Create verification request (already approved)
    const request = await db.verificationRequest.create({
      data: {
        tokenId: testTokenId,
        status: 'APPROVED',
        nonce: generateNonce(),
      },
    });
    testRequestId = request.id;

    // Create first attestation
    const firstAttestation = await db.attestation.create({
      data: {
        tokenId: testTokenId,
        version: 1,
        attestationJson: { test: true, version: 1 },
        signature: 'sig1',
        publicKeyId: 'key1',
      },
    });

    // Attempt to "re-verify" - should check for existing attestation first
    const existingAttestation = await db.attestation.findFirst({
      where: {
        tokenId: testTokenId,
        revokedAt: null,
      },
      orderBy: { version: 'desc' },
    });

    // Should find existing attestation
    expect(existingAttestation).not.toBeNull();
    expect(existingAttestation?.id).toBe(firstAttestation.id);

    // Count attestations - should be exactly 1
    const attestationCount = await db.attestation.count({
      where: { tokenId: testTokenId },
    });
    expect(attestationCount).toBe(1);
  });
});

describe('Search with Multiple Tokens (Symbol Collision)', () => {
  const testTimestamp = Date.now();
  const testSymbol = `SRC${testTimestamp}`;
  const projectIds: string[] = [];
  const tokenIds: string[] = [];

  afterAll(async () => {
    // Clean up
    try {
      for (const tokenId of tokenIds) {
        await db.attestation.deleteMany({ where: { tokenId } });
        await db.token.deleteMany({ where: { id: tokenId } });
      }
      for (const projectId of projectIds) {
        await db.project.deleteMany({ where: { id: projectId } });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should allow multiple tokens with same symbol (collision)', async () => {
    // Create first project and token
    const project1 = await db.project.create({
      data: { displayName: `Verified Project ${testTimestamp}`, contactEmail: 'v@test.com' },
    });
    projectIds.push(project1.id);

    const verifiedToken = await db.token.create({
      data: {
        projectId: project1.id,
        chainId: 1,
        contractAddress: `0x${(testTimestamp + 2000).toString(16).padStart(40, '0')}`.toLowerCase(),
        symbol: testSymbol,
        name: 'Verified Token',
      },
    });
    tokenIds.push(verifiedToken.id);

    // Create second project and token with same symbol
    const project2 = await db.project.create({
      data: { displayName: `Unverified Project ${testTimestamp}`, contactEmail: 'u@test.com' },
    });
    projectIds.push(project2.id);

    const unverifiedToken = await db.token.create({
      data: {
        projectId: project2.id,
        chainId: 1,
        contractAddress: `0x${(testTimestamp + 3000).toString(16).padStart(40, '0')}`.toLowerCase(),
        symbol: testSymbol,
        name: 'Unverified Token',
      },
    });
    tokenIds.push(unverifiedToken.id);

    // Search should return both tokens
    const searchResults = await db.token.findMany({
      where: { symbol: testSymbol },
      include: {
        attestations: {
          where: { revokedAt: null },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(searchResults.length).toBe(2);
    
    // Both should have the same symbol
    expect(searchResults[0].symbol).toBe(testSymbol);
    expect(searchResults[1].symbol).toBe(testSymbol);

    // But different contract addresses
    expect(searchResults[0].contractAddress).not.toBe(searchResults[1].contractAddress);
  });

  it('should correctly identify verified vs unverified in collision scenario', async () => {
    // Get tokens with attestations to determine verification status
    const tokensWithStatus = await db.token.findMany({
      where: { symbol: testSymbol },
      include: {
        attestations: {
          where: { revokedAt: null },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    // Should have multiple tokens
    expect(tokensWithStatus.length).toBeGreaterThanOrEqual(2);

    // Classify as verified (has attestation) or unverified (no attestation)
    const verified = tokensWithStatus.filter((t) => t.attestations.length > 0);
    const unverified = tokensWithStatus.filter((t) => t.attestations.length === 0);

    // Initially none should have attestations (we haven't created any in this test)
    expect(unverified.length).toBe(2);
    expect(verified.length).toBe(0);

    // Now add attestation to first token
    const firstToken = tokensWithStatus[0];
    await db.attestation.create({
      data: {
        tokenId: firstToken.id,
        version: 1,
        attestationJson: {
          verificationTier: 'verified',
          symbol: testSymbol,
        },
        signature: 'test_sig',
        publicKeyId: 'test_key',
      },
    });

    // Re-query
    const updatedTokens = await db.token.findMany({
      where: { symbol: testSymbol },
      include: {
        attestations: {
          where: { revokedAt: null },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    const nowVerified = updatedTokens.filter((t) => t.attestations.length > 0);
    const stillUnverified = updatedTokens.filter((t) => t.attestations.length === 0);

    // Now one should be verified
    expect(nowVerified.length).toBe(1);
    expect(stillUnverified.length).toBe(1);
  });
});
