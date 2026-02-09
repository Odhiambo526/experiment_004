// Token Identity Verification - API Client
// Client for communicating with the verification API

const API_URL = process.env.API_URL || 'http://localhost:3001';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data: ApiResponse<T> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'API request failed');
  }

  return data.data as T;
}

// Project APIs
export async function createProject(input: {
  displayName: string;
  description?: string;
  contactEmail?: string;
}) {
  return apiRequest<{
    id: string;
    displayName: string;
    description: string | null;
    contactEmail: string | null;
    createdAt: string;
  }>('/v1/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getProject(id: string) {
  return apiRequest<{
    id: string;
    displayName: string;
    description: string | null;
    contactEmail: string | null;
    createdAt: string;
    tokensCount: number;
  }>(`/v1/projects/${id}`);
}

// Token APIs
export async function createToken(input: {
  projectId: string;
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals?: number;
  logoUrl?: string;
  websiteUrl?: string;
}) {
  return apiRequest<{
    id: string;
    chainId: number;
    contractAddress: string;
    symbol: string;
    name: string;
    decimals: number | null;
    logoUrl: string | null;
    websiteUrl: string | null;
    createdAt: string;
  }>('/v1/tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getToken(chainId: number, contractAddress: string) {
  return apiRequest<{
    id: string;
    chainId: number;
    contractAddress: string;
    symbol: string;
    name: string;
    decimals: number | null;
    logoUrl: string | null;
    websiteUrl: string | null;
    project: {
      id: string;
      displayName: string;
    };
    verification: {
      status: string;
      tier: string;
      proofs: Array<{
        type: string;
        status: string;
        checkedAt: string | null;
      }>;
    };
    hasAttestation: boolean;
    createdAt: string;
    updatedAt: string;
  }>(`/v1/tokens/${chainId}/${contractAddress}`);
}

// Verification APIs
export async function createVerificationRequest(tokenId: string) {
  return apiRequest<{
    requestId: string;
    tokenId: string;
    status: string;
    nonce: string;
    createdAt: string;
    contract: {
      hasOwner: boolean;
      ownerAddress: string | null;
      type: string;
      note: string;
    };
    onchainSignature: {
      message: string;
      timestamp: number;
      instructions: string[];
    };
    dnsProof: {
      subdomain: string;
      recordType: string;
      recordValue: string;
      instructions: string[];
    };
    githubProof: {
      filePath: string;
      fileContent: string;
      instructions: string[];
    };
  }>('/v1/verification/requests', {
    method: 'POST',
    body: JSON.stringify({ tokenId }),
  });
}

export async function getVerificationRequest(requestId: string) {
  return apiRequest<{
    id: string;
    status: string;
    nonce: string;
    reviewerNotes: string | null;
    token: {
      id: string;
      chainId: number;
      contractAddress: string;
      symbol: string;
      name: string;
    };
    project: {
      id: string;
      displayName: string;
    };
    proofs: Array<{
      id: string;
      type: string;
      status: string;
      checkedAt: string | null;
      failureReason: string | null;
      details: Record<string, unknown>;
    }>;
    createdAt: string;
    updatedAt: string;
  }>(`/v1/verification/requests/${requestId}`);
}

export async function runVerification(requestId: string) {
  return apiRequest<{
    requestId: string;
    verificationTier: string;
    isVerified: boolean;
    attestation?: unknown;
    error?: string;
  }>(`/v1/verification/requests/${requestId}/verify`, {
    method: 'POST',
  });
}

// Proof APIs
export async function submitSignatureProof(
  verificationRequestId: string,
  signature: string,
  claimedAddress?: string
) {
  return apiRequest<{
    proofId: string;
    type: string;
    status: string;
    message: string;
  }>('/v1/proofs/signature', {
    method: 'POST',
    body: JSON.stringify({
      verificationRequestId,
      signature,
      claimedAddress,
    }),
  });
}

export async function submitDnsProof(
  verificationRequestId: string,
  domain: string
) {
  return apiRequest<{
    proofId: string;
    type: string;
    status: string;
    expectedRecord: string;
    recordHost: string;
    message: string;
  }>('/v1/proofs/dns', {
    method: 'POST',
    body: JSON.stringify({
      verificationRequestId,
      domain,
    }),
  });
}

export async function submitGitHubProof(
  verificationRequestId: string,
  owner: string,
  repo: string
) {
  return apiRequest<{
    proofId: string;
    type: string;
    status: string;
    expectedFile: string;
    expectedContent: string;
    repoUrl: string;
    message: string;
  }>('/v1/proofs/github', {
    method: 'POST',
    body: JSON.stringify({
      verificationRequestId,
      owner,
      repo,
    }),
  });
}

// Public APIs
export async function searchTokens(params: {
  symbol?: string;
  chainId?: number;
  tier?: string;
  page?: number;
  pageSize?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.symbol) searchParams.set('symbol', params.symbol);
  if (params.chainId) searchParams.set('chain_id', params.chainId.toString());
  if (params.tier) searchParams.set('tier', params.tier);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('page_size', params.pageSize.toString());

  return apiRequest<{
    tokens: Array<{
      id: string;
      chainId: number;
      chainName: string;
      contractAddress: string;
      symbol: string;
      name: string;
      decimals: number | null;
      logoUrl: string | null;
      websiteUrl: string | null;
      verificationTier: string;
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
  }>(`/v1/tokens?${searchParams.toString()}`);
}

export async function getAttestation(chainId: number, contractAddress: string) {
  return apiRequest<{
    attestation: unknown;
    signature: string;
    publicKeyId: string;
    issuedAt: string;
  }>(`/v1/attestations/${chainId}/${contractAddress}`);
}

export async function getPublicKeys() {
  return apiRequest<{
    keys: Array<{
      id: string;
      algorithm: string;
      publicKey: string;
      createdAt: string;
      isActive: boolean;
    }>;
    usage: {
      algorithm: string;
      encoding: string;
      verification: string;
    };
  }>('/v1/keys');
}
