// Token Identity Verification - DNS TXT Record Verification Service
// Verifies proof-of-control via DNS TXT records

import { promises as dns } from 'dns';
import { PROOF_CONSTANTS } from '@token-verify/shared';
import { generateDnsRecord, parseDnsRecord, withRetry } from '@token-verify/shared';
import { logger } from '../lib/logger.js';

/**
 * Result of DNS verification
 */
export interface DnsVerificationResult {
  isValid: boolean;
  domain: string;
  subdomain: string;
  expectedRecord: string;
  foundRecords: string[];
  error?: string;
}

/**
 * Create a DNS resolver with custom settings
 * 
 * ASSUMPTION: Uses system DNS by default. In production, consider using
 * DNS-over-HTTPS (DoH) for reliability (e.g., Cloudflare 1.1.1.1 or Google 8.8.8.8).
 */
function createResolver(): dns.Resolver {
  const resolver = new dns.Resolver();
  
  // Use custom DNS servers if configured
  const dnsServers = process.env.DNS_SERVERS?.split(',');
  if (dnsServers && dnsServers.length > 0) {
    resolver.setServers(dnsServers);
  }
  
  return resolver;
}

/**
 * Lookup TXT records for a domain
 */
async function lookupTxtRecords(domain: string): Promise<string[]> {
  const resolver = createResolver();
  
  try {
    // resolveTxt returns array of arrays (each TXT record can have multiple strings)
    const records = await resolver.resolveTxt(domain);
    // Flatten and join multi-part TXT records
    return records.map((parts) => parts.join(''));
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const code = (error as NodeJS.ErrnoException).code;
      // These codes mean "no records found" which is a valid response
      if (code === 'ENODATA' || code === 'ENOTFOUND') {
        return [];
      }
    }
    throw error;
  }
}

/**
 * Verify DNS TXT record proof
 * 
 * Expected record location: token-verify.<domain>
 * Expected record format: tokenverif:v1:<requestId>:<nonce>
 */
export async function verifyDnsTxtProof(params: {
  domain: string;
  requestId: string;
  nonce: string;
}): Promise<DnsVerificationResult> {
  const { domain, requestId, nonce } = params;
  const subdomain = PROOF_CONSTANTS.DNS_SUBDOMAIN;
  const fullDomain = `${subdomain}.${domain}`;
  const expectedRecord = generateDnsRecord(requestId, nonce);

  try {
    logger.debug({ fullDomain, expectedRecord }, 'Looking up DNS TXT records');

    // Retry DNS lookups with exponential backoff
    const foundRecords = await withRetry(
      () => lookupTxtRecords(fullDomain),
      { maxRetries: 3, baseDelay: 1000 }
    );

    logger.debug({ fullDomain, foundRecords }, 'DNS TXT records found');

    // Check if any record matches exactly (case sensitive)
    const isValid = foundRecords.some((record) => record === expectedRecord);

    return {
      isValid,
      domain,
      subdomain,
      expectedRecord,
      foundRecords,
      error: isValid ? undefined : `Expected record "${expectedRecord}" not found`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown DNS error';
    logger.error({ error, fullDomain }, 'DNS verification failed');

    return {
      isValid: false,
      domain,
      subdomain,
      expectedRecord,
      foundRecords: [],
      error: `DNS lookup failed: ${errorMessage}`,
    };
  }
}

/**
 * Generate instructions for setting up DNS TXT record proof
 */
export function generateDnsInstructions(params: {
  domain: string;
  requestId: string;
  nonce: string;
}): {
  recordHost: string;
  recordType: string;
  recordValue: string;
  instructions: string[];
} {
  const { domain, requestId, nonce } = params;
  const subdomain = PROOF_CONSTANTS.DNS_SUBDOMAIN;
  const recordValue = generateDnsRecord(requestId, nonce);

  return {
    recordHost: `${subdomain}.${domain}`,
    recordType: 'TXT',
    recordValue,
    instructions: [
      `Log in to your DNS provider for ${domain}`,
      `Add a new TXT record with:`,
      `  - Host/Name: ${subdomain}`,
      `  - Type: TXT`,
      `  - Value: ${recordValue}`,
      `Wait for DNS propagation (typically 5-15 minutes)`,
      `Click "Verify" to check the record`,
    ],
  };
}

/**
 * Check if DNS records have propagated
 * Useful for giving user feedback while waiting
 */
export async function checkDnsPropagation(domain: string): Promise<{
  propagated: boolean;
  servers: Array<{ server: string; found: boolean; records: string[] }>;
}> {
  const fullDomain = `${PROOF_CONSTANTS.DNS_SUBDOMAIN}.${domain}`;
  const dnsServers = ['8.8.8.8', '1.1.1.1', '9.9.9.9']; // Google, Cloudflare, Quad9
  
  const results = await Promise.all(
    dnsServers.map(async (server) => {
      try {
        const resolver = new dns.Resolver();
        resolver.setServers([server]);
        const records = await resolver.resolveTxt(fullDomain);
        const flatRecords = records.map((parts) => parts.join(''));
        return { server, found: flatRecords.length > 0, records: flatRecords };
      } catch {
        return { server, found: false, records: [] };
      }
    })
  );

  return {
    propagated: results.some((r) => r.found),
    servers: results,
  };
}
