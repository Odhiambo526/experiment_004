// Token Identity Verification - Zod Validation Schemas
// All input validation is done through these schemas for determinism and safety

import { z } from 'zod';
import { SupportedChain, VerificationTier } from './types.js';

/**
 * Ethereum address validation
 * Supports checksummed and non-checksummed addresses
 */
export const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
  .transform((addr) => addr.toLowerCase());

/**
 * Chain ID validation - only supported chains
 */
export const chainIdSchema = z
  .number()
  .int()
  .positive()
  .refine(
    (id) => Object.values(SupportedChain).includes(id),
    'Unsupported chain ID'
  );

/**
 * Domain name validation
 * Conservative regex - allows typical domain formats
 */
export const domainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$/,
    'Invalid domain format'
  );

/**
 * GitHub username/org validation
 */
export const githubUsernameSchema = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/, 'Invalid GitHub username');

/**
 * GitHub repository name validation
 */
export const githubRepoSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid GitHub repository name');

/**
 * Token symbol validation
 * Conservative: 1-20 uppercase alphanumeric characters
 */
export const tokenSymbolSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Z0-9]+$/, 'Symbol must be uppercase alphanumeric');

/**
 * Token name validation
 */
export const tokenNameSchema = z
  .string()
  .min(1)
  .max(100)
  .trim();

/**
 * EIP-191 signature validation (hex string)
 */
export const signatureSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid signature format (expected 65 bytes hex)');

/**
 * Nonce validation (used in proofs)
 */
export const nonceSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[a-zA-Z0-9]+$/, 'Invalid nonce format');

// =============================================================================
// API Request Schemas
// =============================================================================

/**
 * Create project request
 */
export const createProjectSchema = z.object({
  displayName: z.string().min(1).max(100).trim(),
  description: z.string().max(1000).optional(),
  contactEmail: z.string().email().optional(),
});

/**
 * Create token request
 */
export const createTokenSchema = z.object({
  projectId: z.string().cuid(),
  chainId: chainIdSchema,
  contractAddress: ethereumAddressSchema,
  symbol: tokenSymbolSchema,
  name: tokenNameSchema,
  decimals: z.number().int().min(0).max(18).optional(),
  logoUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
});

/**
 * Create verification request
 */
export const createVerificationRequestSchema = z.object({
  tokenId: z.string().cuid(),
});

/**
 * Submit onchain signature proof
 */
export const submitOnchainSignatureSchema = z.object({
  verificationRequestId: z.string().cuid(),
  signature: signatureSchema,
  // The message is reconstructed server-side for security
});

/**
 * Submit DNS proof
 */
export const submitDnsProofSchema = z.object({
  verificationRequestId: z.string().cuid(),
  domain: domainSchema,
});

/**
 * Submit GitHub proof
 */
export const submitGitHubProofSchema = z.object({
  verificationRequestId: z.string().cuid(),
  owner: githubUsernameSchema,
  repo: githubRepoSchema,
});

/**
 * Token list query parameters
 */
export const tokenListQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  symbol: z.string().min(1).max(20).optional(),
  tier: z.nativeEnum(VerificationTier).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Token lookup parameters
 */
export const tokenLookupSchema = z.object({
  chainId: chainIdSchema,
  contractAddress: ethereumAddressSchema,
});

/**
 * Dispute submission
 */
export const createDisputeSchema = z.object({
  verificationRequestId: z.string().cuid(),
  reason: z.string().min(10).max(2000),
  evidence: z.array(z.object({
    type: z.string(),
    url: z.string().url().optional(),
    description: z.string().max(500),
  })).max(10).optional(),
});

// =============================================================================
// Response Schemas (for type safety)
// =============================================================================

export const verificationTierSchema = z.nativeEnum(VerificationTier);

export const tokenMetadataSchema = z.object({
  chainId: z.number(),
  contractAddress: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().optional(),
  logoUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
});

export const attestationDataSchema = z.object({
  version: z.string(),
  timestamp: z.number(),
  token: tokenMetadataSchema,
  verification: z.object({
    tier: verificationTierSchema,
    requestId: z.string(),
    proofs: z.array(z.object({
      type: z.string(),
      status: z.enum(['valid', 'invalid']),
      checkedAt: z.string(),
    })),
  }),
  project: z.object({
    id: z.string(),
    displayName: z.string(),
    websiteUrl: z.string().optional(),
  }),
});

// =============================================================================
// Type exports from schemas
// =============================================================================

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateTokenInput = z.infer<typeof createTokenSchema>;
export type CreateVerificationRequestInput = z.infer<typeof createVerificationRequestSchema>;
export type SubmitOnchainSignatureInput = z.infer<typeof submitOnchainSignatureSchema>;
export type SubmitDnsProofInput = z.infer<typeof submitDnsProofSchema>;
export type SubmitGitHubProofInput = z.infer<typeof submitGitHubProofSchema>;
export type TokenListQuery = z.infer<typeof tokenListQuerySchema>;
export type TokenLookup = z.infer<typeof tokenLookupSchema>;
export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;
