// Token Identity Verification - Utility Functions
// Common utilities used across API and web packages

import { SIGNING_MESSAGE_TEMPLATE, DNS_RECORD_TEMPLATE, GITHUB_PROOF_TEMPLATE } from './constants.js';
import type { SigningMessageParams } from './types.js';

/**
 * Generate the signing message for a verification request
 * This message is signed by the token owner/deployer using EIP-191 personal_sign
 */
export function generateSigningMessage(params: SigningMessageParams): string {
  return SIGNING_MESSAGE_TEMPLATE
    .replace('{{domain}}', params.domain)
    .replace('{{chainId}}', params.chainId.toString())
    .replace('{{contractAddress}}', params.contractAddress.toLowerCase())
    .replace('{{requestId}}', params.requestId)
    .replace('{{timestamp}}', params.timestamp.toString())
    .replace('{{nonce}}', params.nonce);
}

/**
 * Generate the expected DNS TXT record value
 */
export function generateDnsRecord(requestId: string, nonce: string): string {
  return DNS_RECORD_TEMPLATE
    .replace('{{requestId}}', requestId)
    .replace('{{nonce}}', nonce);
}

/**
 * Generate the expected GitHub proof file content
 */
export function generateGitHubProofContent(requestId: string, nonce: string): string {
  return GITHUB_PROOF_TEMPLATE
    .replace('{{requestId}}', requestId)
    .replace('{{nonce}}', nonce);
}

/**
 * Generate a cryptographically secure random nonce
 * Uses Web Crypto API for security
 */
export function generateNonce(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize an Ethereum address to lowercase with 0x prefix
 */
export function normalizeAddress(address: string): string {
  if (!address.startsWith('0x')) {
    address = '0x' + address;
  }
  return address.toLowerCase();
}

/**
 * Validate and normalize an Ethereum address
 * Returns null if invalid
 */
export function validateAddress(address: string): string | null {
  const normalized = normalizeAddress(address);
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Parse a DNS TXT record value
 * Returns parsed components or null if invalid format
 * Request ID can contain alphanumerics and underscores, nonce is hex
 */
export function parseDnsRecord(record: string): { requestId: string; nonce: string } | null {
  const match = record.match(/^tokenverif:v1:([a-zA-Z0-9_]+):([a-fA-F0-9]+)$/);
  if (!match) {
    return null;
  }
  return {
    requestId: match[1],
    nonce: match[2],
  };
}

/**
 * Parse GitHub proof file content
 * Returns parsed components or null if invalid format
 * Request ID can contain alphanumerics and underscores, nonce is hex
 */
export function parseGitHubProof(content: string): { requestId: string; nonce: string } | null {
  const trimmed = content.trim();
  const match = trimmed.match(/^tokenverif:v1:([a-zA-Z0-9_]+):([a-fA-F0-9]+)$/);
  if (!match) {
    return null;
  }
  return {
    requestId: match[1],
    nonce: match[2],
  };
}

/**
 * Format a timestamp as ISO string
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Calculate proof expiration date
 */
export function getProofExpirationDate(daysFromNow: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

/**
 * Check if a date is within a valid window
 */
export function isWithinTimeWindow(
  timestamp: number,
  windowMinutes: number = 15
): boolean {
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= windowMinutes * 60 * 1000;
}

/**
 * Sleep utility for rate limiting and retries
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * Truncate a string for display purposes
 */
export function truncate(str: string, maxLength: number = 50): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format an address for display (0x1234...5678)
 */
export function formatAddressShort(address: string): string {
  if (address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Deep clone an object (JSON-serializable only)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Type guard to check if value is not null or undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
