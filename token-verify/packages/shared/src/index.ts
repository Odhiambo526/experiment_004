// Token Identity Verification - Shared Types and Utilities
// This module exports common types, validation schemas, and constants

export * from './types.js';
export {
  // Schemas
  ethereumAddressSchema,
  chainIdSchema,
  domainSchema,
  githubUsernameSchema,
  githubRepoSchema,
  tokenSymbolSchema,
  tokenNameSchema,
  signatureSchema,
  nonceSchema,
  createProjectSchema,
  createTokenSchema,
  createVerificationRequestSchema,
  submitOnchainSignatureSchema,
  submitDnsProofSchema,
  submitGitHubProofSchema,
  tokenListQuerySchema,
  tokenLookupSchema,
  createDisputeSchema,
  verificationTierSchema,
  tokenMetadataSchema,
  attestationDataSchema,
  // Types from schemas (these don't conflict)
  type CreateProjectInput,
  type CreateTokenInput,
  type SubmitOnchainSignatureInput,
  type SubmitDnsProofInput,
  type SubmitGitHubProofInput,
  type TokenListQuery,
  type TokenLookup,
  type CreateDisputeInput,
} from './schemas.js';
export * from './constants.js';
export * from './utils.js';
