// Token Identity Verification - Attestation Signing Service
// Creates and signs attestation bundles using Ed25519

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { type Prisma } from '@prisma/client';
import { ATTESTATION_VERSION } from '@token-verify/shared';
import type { AttestationData, SignedAttestation, VerificationTier, TokenMetadata } from '@token-verify/shared';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// Configure ed25519 to use sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/**
 * Signing key cache
 */
let activeKeyCache: {
  id: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} | null = null;

/**
 * Get or create the active signing key
 */
async function getActiveSigningKey(): Promise<{
  id: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  if (activeKeyCache) {
    return activeKeyCache;
  }

  // Try to get existing active key from database
  const existingKey = await db.signingKey.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (existingKey) {
    activeKeyCache = {
      id: existingKey.id,
      publicKey: Buffer.from(existingKey.publicKey, 'base64'),
      privateKey: Buffer.from(existingKey.privateKey, 'base64'),
    };
    return activeKeyCache;
  }

  // Generate new key pair
  logger.info('Generating new Ed25519 signing key');
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  // Store in database
  // NOTE: In production, private key should be encrypted or stored in HSM/KMS
  const newKey = await db.signingKey.create({
    data: {
      algorithm: 'Ed25519',
      publicKey: Buffer.from(publicKey).toString('base64'),
      privateKey: Buffer.from(privateKey).toString('base64'),
      isActive: true,
    },
  });

  activeKeyCache = {
    id: newKey.id,
    publicKey,
    privateKey,
  };

  return activeKeyCache;
}

/**
 * Sign data using the active signing key
 */
async function signData(data: string): Promise<{ signature: string; publicKeyId: string }> {
  const key = await getActiveSigningKey();
  const message = new TextEncoder().encode(data);
  const signature = await ed.signAsync(message, key.privateKey);

  return {
    signature: Buffer.from(signature).toString('base64'),
    publicKeyId: key.id,
  };
}

/**
 * Verify a signature using a public key
 */
export async function verifySignature(
  data: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    const message = new TextEncoder().encode(data);
    const sigBytes = Buffer.from(signature, 'base64');
    const pubKeyBytes = Buffer.from(publicKey, 'base64');
    return await ed.verifyAsync(sigBytes, message, pubKeyBytes);
  } catch (error) {
    logger.error({ error }, 'Signature verification failed');
    return false;
  }
}

/**
 * Create and sign an attestation for a verified token
 */
export async function createAttestation(params: {
  token: TokenMetadata & { id: string };
  verificationTier: VerificationTier;
  requestId: string;
  proofs: Array<{
    type: string;
    status: 'valid' | 'invalid';
    checkedAt: Date;
  }>;
  project: {
    id: string;
    displayName: string;
    websiteUrl?: string;
  };
}): Promise<SignedAttestation> {
  const { token, verificationTier, requestId, proofs, project } = params;

  // Build attestation data
  const attestationData: AttestationData = {
    version: ATTESTATION_VERSION,
    timestamp: Date.now(),
    token: {
      chainId: token.chainId,
      contractAddress: token.contractAddress,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoUrl: token.logoUrl,
      websiteUrl: token.websiteUrl,
    },
    verification: {
      tier: verificationTier,
      requestId,
      proofs: proofs.map((p) => ({
        type: p.type,
        status: p.status,
        checkedAt: p.checkedAt.toISOString(),
      })),
    },
    project: {
      id: project.id,
      displayName: project.displayName,
      websiteUrl: project.websiteUrl,
    },
  };

  // Sign the attestation
  const attestationJson = JSON.stringify(attestationData);
  const { signature, publicKeyId } = await signData(attestationJson);
  const issuedAt = new Date();

  // Store attestation in database
  // Get the next version number for this token
  const lastAttestation = await db.attestation.findFirst({
    where: { tokenId: token.id },
    orderBy: { version: 'desc' },
  });

  await db.attestation.create({
    data: {
      tokenId: token.id,
      version: (lastAttestation?.version ?? 0) + 1,
      attestationJson: attestationData as unknown as Prisma.InputJsonValue,
      signature,
      publicKeyId,
      issuedAt,
    },
  });

  logger.info(
    { tokenId: token.id, tier: verificationTier },
    'Attestation created'
  );

  return {
    attestation: attestationData,
    signature,
    publicKeyId,
    issuedAt: issuedAt.toISOString(),
  };
}

/**
 * Revoke an attestation
 */
export async function revokeAttestation(
  attestationId: string,
  reason: string
): Promise<void> {
  await db.attestation.update({
    where: { id: attestationId },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });

  logger.info({ attestationId, reason }, 'Attestation revoked');
}

/**
 * Get all public keys for JWKS endpoint
 */
export async function getPublicKeys(): Promise<
  Array<{
    id: string;
    algorithm: string;
    publicKey: string;
    createdAt: string;
    isActive: boolean;
  }>
> {
  const keys = await db.signingKey.findMany({
    select: {
      id: true,
      algorithm: true,
      publicKey: true,
      createdAt: true,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return keys.map((key) => ({
    id: key.id,
    algorithm: key.algorithm,
    publicKey: key.publicKey,
    createdAt: key.createdAt.toISOString(),
    isActive: key.isActive,
  }));
}

/**
 * Get the latest attestation for a token
 */
export async function getLatestAttestation(
  chainId: number,
  contractAddress: string
): Promise<SignedAttestation | null> {
  const token = await db.token.findUnique({
    where: {
      chainId_contractAddress: {
        chainId,
        contractAddress: contractAddress.toLowerCase(),
      },
    },
  });

  if (!token) {
    return null;
  }

  const attestation = await db.attestation.findFirst({
    where: {
      tokenId: token.id,
      revokedAt: null,
    },
    orderBy: { version: 'desc' },
  });

  if (!attestation) {
    return null;
  }

  const key = await db.signingKey.findUnique({
    where: { id: attestation.publicKeyId },
  });

  return {
    attestation: attestation.attestationJson as unknown as AttestationData,
    signature: attestation.signature,
    publicKeyId: attestation.publicKeyId,
    issuedAt: attestation.issuedAt.toISOString(),
  };
}
