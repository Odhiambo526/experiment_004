// Token Identity Verification - Core Types
// These types define the shape of data throughout the system

/**
 * Verification Tiers - Explicit levels of verification
 * 
 * IMPORTANT: We do NOT claim global ticker uniqueness.
 * We verify identity assertions tied to a specific (chain, contract_address) pair.
 */
export enum VerificationTier {
  /**
   * VERIFIED: Highest tier
   * Requirements:
   * - Valid onchain signature from owner (Ownable/EIP-173)
   * - At least 2 valid offchain proofs (DNS + GitHub recommended)
   */
  VERIFIED = 'verified',

  /**
   * DEPLOYER_VERIFIED: Mid tier
   * Requirements:
   * - Valid signature from contract deployer (no owner() function found)
   * - At least 1 valid offchain proof
   */
  DEPLOYER_VERIFIED = 'deployer_verified',

  /**
   * UNVERIFIED: Default tier
   * No valid proofs or insufficient proofs
   */
  UNVERIFIED = 'unverified',
}

/**
 * Supported blockchain networks
 * Conservative list - only chains we can reliably verify
 */
export enum SupportedChain {
  ETHEREUM_MAINNET = 1,
  GOERLI = 5,
  SEPOLIA = 11155111,
  POLYGON = 137,
  POLYGON_MUMBAI = 80001,
  ARBITRUM_ONE = 42161,
  ARBITRUM_SEPOLIA = 421614,
  OPTIMISM = 10,
  BASE = 8453,
  BASE_SEPOLIA = 84532,
  BSC = 56,
  BSC_TESTNET = 97,
  AVALANCHE = 43114,
}

/**
 * Onchain signature verification result
 */
export interface OnchainSignatureResult {
  isValid: boolean;
  recoveredAddress: string;
  expectedAddress: string;
  verificationTier: 'owner' | 'deployer' | 'unknown';
  contractType?: 'ownable' | 'eip173' | 'none';
  error?: string;
}

/**
 * DNS TXT proof payload
 */
export interface DnsTxtProofPayload {
  domain: string;
  subdomain: string; // e.g., "token-verify"
  expectedRecord: string;
  foundRecords?: string[];
}

/**
 * GitHub proof payload
 */
export interface GitHubProofPayload {
  type: 'repo' | 'gist';
  owner: string;
  repo?: string;
  gistId?: string;
  filePath: string;
  expectedContent: string;
  foundContent?: string;
}

/**
 * Onchain signature proof payload
 */
export interface OnchainSignatureProofPayload {
  message: string;
  signature: string;
  recoveredAddress?: string;
  expectedAddress?: string;
  verificationTier?: 'owner' | 'deployer';
  chainId: number;
  contractAddress: string;
  timestamp: number;
  nonce: string;
}

/**
 * Proof payload union type
 */
export type ProofPayload =
  | OnchainSignatureProofPayload
  | DnsTxtProofPayload
  | GitHubProofPayload;

/**
 * Token metadata bundle - the canonical data for integrators
 */
export interface TokenMetadata {
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals?: number;
  logoUrl?: string;
  websiteUrl?: string;
}

/**
 * Attestation data structure
 * This is what gets signed and published for integrators
 */
export interface AttestationData {
  version: string; // Attestation format version
  timestamp: number;
  token: TokenMetadata;
  verification: {
    tier: VerificationTier;
    requestId: string;
    proofs: {
      type: string;
      status: 'valid' | 'invalid';
      checkedAt: string;
    }[];
  };
  project: {
    id: string;
    displayName: string;
    websiteUrl?: string;
  };
}

/**
 * Signed attestation response
 */
export interface SignedAttestation {
  attestation: AttestationData;
  signature: string;
  publicKeyId: string;
  issuedAt: string;
}

/**
 * Public key info for JWKS endpoint
 */
export interface PublicKeyInfo {
  id: string;
  algorithm: string;
  publicKey: string; // Base64 encoded
  createdAt: string;
  isActive: boolean;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

/**
 * Token list response
 */
export interface TokenListResponse {
  tokens: Array<{
    id: string;
    chainId: number;
    contractAddress: string;
    symbol: string;
    name: string;
    decimals?: number;
    logoUrl?: string;
    verificationTier: VerificationTier;
    project: {
      id: string;
      displayName: string;
    };
  }>;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

/**
 * Proof submission input
 */
export interface SubmitProofInput {
  verificationRequestId: string;
  type: 'onchain_signature' | 'dns_txt' | 'github_repo';
  payload: ProofPayload;
}

/**
 * Signing message template
 */
export interface SigningMessageParams {
  domain: string;
  chainId: number;
  contractAddress: string;
  timestamp: number;
  nonce: string;
  requestId: string;
}
