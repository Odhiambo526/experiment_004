// Token Identity Verification - GitHub Proof Verification Service
// Verifies proof-of-control via GitHub repository files

import { PROOF_CONSTANTS } from '@token-verify/shared';
import { generateGitHubProofContent, parseGitHubProof, withRetry } from '@token-verify/shared';
import { logger } from '../lib/logger.js';

/**
 * Result of GitHub verification
 */
export interface GitHubVerificationResult {
  isValid: boolean;
  owner: string;
  repo: string;
  filePath: string;
  expectedContent: string;
  foundContent: string | null;
  error?: string;
}

/**
 * GitHub API base URL
 */
const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Get GitHub API headers
 * Uses token from environment for higher rate limits
 */
function getGitHubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'TokenVerify/1.0',
  };

  // Add auth token if available (increases rate limit from 60 to 5000 req/hour)
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Fetch raw content from a GitHub repository file
 * 
 * Uses the official GitHub API - no scraping.
 */
async function fetchGitHubFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<{ content: string | null; error?: string }> {
  try {
    // GitHub API endpoint for file contents
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    
    logger.debug({ url }, 'Fetching GitHub file');

    const response = await fetch(url, { headers: getGitHubHeaders() });

    if (response.status === 404) {
      // Try with 'master' branch if 'main' failed
      if (branch === 'main') {
        return fetchGitHubFileContent(owner, repo, path, 'master');
      }
      return { content: null, error: 'File not found' };
    }

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        content: null,
        error: `GitHub API error: ${response.status} ${errorBody}`,
      };
    }

    const data = await response.json() as {
      content?: string;
      encoding?: string;
      message?: string;
    };

    // GitHub returns base64-encoded content
    if (data.content && data.encoding === 'base64') {
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      return { content: decoded.trim() };
    }

    return { content: null, error: 'Unexpected response format' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { content: null, error: errorMessage };
  }
}

/**
 * Check if a GitHub repository exists and is public
 */
async function checkRepoExists(owner: string, repo: string): Promise<{
  exists: boolean;
  isPublic: boolean;
  error?: string;
}> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
    const response = await fetch(url, { headers: getGitHubHeaders() });

    if (response.status === 404) {
      return { exists: false, isPublic: false, error: 'Repository not found' };
    }

    if (!response.ok) {
      return {
        exists: false,
        isPublic: false,
        error: `GitHub API error: ${response.status}`,
      };
    }

    const data = await response.json() as { private?: boolean };
    return {
      exists: true,
      isPublic: !data.private,
      error: data.private ? 'Repository is private' : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { exists: false, isPublic: false, error: errorMessage };
  }
}

/**
 * Verify GitHub repository file proof
 * 
 * Expected file location: .well-known/tokenverif.txt
 * Expected content format: tokenverif:v1:<requestId>:<nonce>
 */
export async function verifyGitHubProof(params: {
  owner: string;
  repo: string;
  requestId: string;
  nonce: string;
}): Promise<GitHubVerificationResult> {
  const { owner, repo, requestId, nonce } = params;
  const filePath = PROOF_CONSTANTS.GITHUB_WELL_KNOWN_PATH;
  const expectedContent = generateGitHubProofContent(requestId, nonce);

  try {
    logger.debug({ owner, repo, filePath, expectedContent }, 'Verifying GitHub proof');

    // First check if repo exists and is public
    const repoCheck = await checkRepoExists(owner, repo);
    if (!repoCheck.exists || !repoCheck.isPublic) {
      return {
        isValid: false,
        owner,
        repo,
        filePath,
        expectedContent,
        foundContent: null,
        error: repoCheck.error || 'Repository not found or private',
      };
    }

    // Fetch the proof file with retries
    const result = await withRetry(
      () => fetchGitHubFileContent(owner, repo, filePath),
      { maxRetries: 2, baseDelay: 1000 }
    );

    if (result.error || result.content === null) {
      return {
        isValid: false,
        owner,
        repo,
        filePath,
        expectedContent,
        foundContent: null,
        error: result.error || 'File content is empty',
      };
    }

    // Parse and validate the content
    const parsed = parseGitHubProof(result.content);
    const isValid =
      parsed !== null &&
      parsed.requestId === requestId &&
      parsed.nonce === nonce;

    logger.debug(
      { foundContent: result.content, parsed, isValid },
      'GitHub proof verification result'
    );

    return {
      isValid,
      owner,
      repo,
      filePath,
      expectedContent,
      foundContent: result.content,
      error: isValid ? undefined : `Content mismatch. Expected "${expectedContent}"`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, params }, 'GitHub verification failed');

    return {
      isValid: false,
      owner,
      repo,
      filePath,
      expectedContent,
      foundContent: null,
      error: `GitHub verification failed: ${errorMessage}`,
    };
  }
}

/**
 * Generate instructions for setting up GitHub proof
 */
export function generateGitHubInstructions(params: {
  owner: string;
  repo: string;
  requestId: string;
  nonce: string;
}): {
  fileUrl: string;
  filePath: string;
  fileContent: string;
  instructions: string[];
} {
  const { owner, repo, requestId, nonce } = params;
  const filePath = PROOF_CONSTANTS.GITHUB_WELL_KNOWN_PATH;
  const fileContent = generateGitHubProofContent(requestId, nonce);
  const fileUrl = `https://github.com/${owner}/${repo}/blob/main/${filePath}`;

  return {
    fileUrl,
    filePath,
    fileContent,
    instructions: [
      `Go to your repository: https://github.com/${owner}/${repo}`,
      `Create a new file at: ${filePath}`,
      `Add the following content (exactly as shown):`,
      `  ${fileContent}`,
      `Commit the file to the main (or master) branch`,
      `Click "Verify" to check the file`,
    ],
  };
}

/**
 * Get GitHub API rate limit status
 */
export async function getGitHubRateLimit(): Promise<{
  limit: number;
  remaining: number;
  reset: Date;
}> {
  const response = await fetch(`${GITHUB_API_BASE}/rate_limit`, {
    headers: getGitHubHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get rate limit: ${response.status}`);
  }

  const data = await response.json() as {
    rate: { limit: number; remaining: number; reset: number };
  };

  return {
    limit: data.rate.limit,
    remaining: data.rate.remaining,
    reset: new Date(data.rate.reset * 1000),
  };
}
