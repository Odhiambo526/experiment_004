// Token Identity Verification - Constants
// All magic numbers and configuration values in one place

/**
 * Application domain for signing messages
 * MUST be consistent across all environments for signature verification
 */
export const APP_DOMAIN = 'tokenverify.app';

/**
 * Attestation format version
 * Increment when making breaking changes to attestation structure
 */
export const ATTESTATION_VERSION = '1.0.0';

/**
 * Proof verification constants
 */
export const PROOF_CONSTANTS = {
  // DNS TXT record subdomain
  DNS_SUBDOMAIN: 'token-verify',
  
  // DNS TXT record prefix
  DNS_RECORD_PREFIX: 'tokenverif:v1:',
  
  // GitHub well-known file path
  GITHUB_WELL_KNOWN_PATH: '.well-known/tokenverif.txt',
  
  // Maximum age for a proof check before requiring re-verification (in days)
  PROOF_MAX_AGE_DAYS: 30,
  
  // Grace period before downgrading a token after failed re-verification (in days)
  GRACE_PERIOD_DAYS: 7,
  
  // Maximum consecutive failures before automatic downgrade
  MAX_CONSECUTIVE_FAILURES: 3,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMITS = {
  // Verification submissions per hour per IP
  SUBMISSIONS_PER_HOUR: 10,
  
  // API reads per minute per IP
  READS_PER_MINUTE: 100,
  
  // Proof check retries per request
  PROOF_CHECK_RETRIES: 3,
  
  // GitHub API calls per hour (respect GitHub's limits)
  GITHUB_CALLS_PER_HOUR: 5000,
  
  // DNS queries per minute
  DNS_QUERIES_PER_MINUTE: 60,
} as const;

/**
 * RPC endpoints for supported chains
 * Using public endpoints - in production, use dedicated RPC providers
 * 
 * ASSUMPTION: These are fallback public RPCs. Production deployments
 * should configure private RPC endpoints via environment variables.
 */
export const CHAIN_RPC_ENDPOINTS: Record<number, string> = {
  1: 'https://eth.llamarpc.com',
  5: 'https://goerli.infura.io/v3/public',
  11155111: 'https://sepolia.infura.io/v3/public',
  137: 'https://polygon-rpc.com',
  80001: 'https://rpc-mumbai.maticvigil.com',
  42161: 'https://arb1.arbitrum.io/rpc',
  421614: 'https://sepolia-rollup.arbitrum.io/rpc',
  10: 'https://mainnet.optimism.io',
  8453: 'https://mainnet.base.org',
  84532: 'https://sepolia.base.org',
  56: 'https://bsc-dataseed.binance.org',
  97: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  43114: 'https://api.avax.network/ext/bc/C/rpc',
};

/**
 * Supported chain names for display
 */
export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  5: 'Goerli Testnet',
  11155111: 'Sepolia Testnet',
  137: 'Polygon',
  80001: 'Polygon Mumbai',
  42161: 'Arbitrum One',
  421614: 'Arbitrum Sepolia',
  10: 'Optimism',
  8453: 'Base',
  84532: 'Base Sepolia',
  56: 'BNB Chain',
  97: 'BNB Chain Testnet',
  43114: 'Avalanche C-Chain',
};

/**
 * Block explorers for supported chains
 */
export const BLOCK_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  5: 'https://goerli.etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
  137: 'https://polygonscan.com',
  80001: 'https://mumbai.polygonscan.com',
  42161: 'https://arbiscan.io',
  421614: 'https://sepolia.arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  8453: 'https://basescan.org',
  84532: 'https://sepolia.basescan.org',
  56: 'https://bscscan.com',
  97: 'https://testnet.bscscan.com',
  43114: 'https://snowtrace.io',
};

/**
 * Signing message template
 * This exact format is used for EIP-191 personal_sign messages
 * 
 * IMPORTANT: Do not modify this template without incrementing ATTESTATION_VERSION
 * as it would invalidate existing signatures.
 */
export const SIGNING_MESSAGE_TEMPLATE = `Token Identity Verification Request

I am the controller of this token contract and request verification.

Domain: {{domain}}
Chain ID: {{chainId}}
Contract: {{contractAddress}}
Request ID: {{requestId}}
Timestamp: {{timestamp}}
Nonce: {{nonce}}

By signing this message, I confirm that:
1. I have legitimate control over the token contract at the address above.
2. The metadata I submitted is accurate and truthful.
3. I understand that verification does not grant exclusive rights to the token symbol.`;

/**
 * DNS record format template
 */
export const DNS_RECORD_TEMPLATE = 'tokenverif:v1:{{requestId}}:{{nonce}}';

/**
 * GitHub proof file content template
 */
export const GITHUB_PROOF_TEMPLATE = 'tokenverif:v1:{{requestId}}:{{nonce}}';

/**
 * API error codes
 */
export const ERROR_CODES = {
  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_CHAIN: 'INVALID_CHAIN',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  
  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  
  // Verification errors
  PROOF_FAILED: 'PROOF_FAILED',
  VERIFICATION_PENDING: 'VERIFICATION_PENDING',
  VERIFICATION_REVOKED: 'VERIFICATION_REVOKED',
  
  // Authorization errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  
  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

/**
 * Audit log action types
 */
export const AUDIT_ACTIONS = {
  // Project actions
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  
  // Token actions
  TOKEN_CREATED: 'token.created',
  TOKEN_UPDATED: 'token.updated',
  
  // Verification actions
  VERIFICATION_REQUESTED: 'verification.requested',
  VERIFICATION_APPROVED: 'verification.approved',
  VERIFICATION_REJECTED: 'verification.rejected',
  VERIFICATION_REVOKED: 'verification.revoked',
  
  // Proof actions
  PROOF_SUBMITTED: 'proof.submitted',
  PROOF_CHECKED: 'proof.checked',
  PROOF_VALID: 'proof.valid',
  PROOF_INVALID: 'proof.invalid',
  
  // Attestation actions
  ATTESTATION_ISSUED: 'attestation.issued',
  ATTESTATION_REVOKED: 'attestation.revoked',
  
  // Dispute actions
  DISPUTE_OPENED: 'dispute.opened',
  DISPUTE_RESOLVED: 'dispute.resolved',
  
  // Re-verification actions
  REVERIFICATION_SCHEDULED: 'reverification.scheduled',
  REVERIFICATION_PASSED: 'reverification.passed',
  REVERIFICATION_FAILED: 'reverification.failed',
} as const;
