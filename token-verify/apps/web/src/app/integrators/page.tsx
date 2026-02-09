'use client';

import { useState } from 'react';
import { CopyButton, Spinner, Alert, ErrorState } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Code snippets
const SEARCH_EXAMPLE = `// Search for tokens by symbol
const response = await fetch(
  '${API_URL}/v1/tokens?symbol=USDT&chain_id=1'
);
const { data } = await response.json();

// Results are sorted: verified tokens first
data.tokens.forEach(token => {
  console.log(token.symbol, token.verificationTier);
});`;

const ATTESTATION_EXAMPLE = `// Get attestation for a specific token
const response = await fetch(
  '${API_URL}/v1/attestations/1/0xdAC17F958D2ee523a2206206994597C13D831ec7'
);
const { data } = await response.json();

console.log('Tier:', data.verificationTier);
console.log('Attestation:', data.attestation);
console.log('Signature:', data.signature);`;

const VERIFY_SIGNATURE_CODE = `import * as ed from '@noble/ed25519';

interface Attestation {
  attestationJson: object;
  signature: string;
  publicKeyId: string;
}

interface PublicKey {
  id: string;
  publicKey: string;  // hex-encoded Ed25519 public key
  algorithm: string;
}

async function verifyAttestation(
  apiUrl: string,
  chainId: number,
  contractAddress: string
): Promise<{ valid: boolean; attestation?: object; error?: string }> {
  try {
    // 1. Fetch the attestation
    const attRes = await fetch(
      \`\${apiUrl}/v1/attestations/\${chainId}/\${contractAddress}\`
    );
    if (!attRes.ok) {
      return { valid: false, error: 'Attestation not found' };
    }
    const { data: att } = await attRes.json();
    
    // 2. Fetch public keys
    const keysRes = await fetch(\`\${apiUrl}/v1/keys\`);
    const { data: keysData } = await keysRes.json();
    
    // 3. Find the matching key
    const key = keysData.keys.find(
      (k: PublicKey) => k.id === att.publicKeyId
    );
    if (!key) {
      return { valid: false, error: 'Public key not found' };
    }
    
    // 4. Verify the signature
    const message = JSON.stringify(att.attestationJson);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(
      Buffer.from(att.signature, 'base64')
    );
    const publicKeyBytes = Uint8Array.from(
      Buffer.from(key.publicKey, 'hex')
    );
    
    const valid = await ed.verifyAsync(
      signatureBytes,
      messageBytes,
      publicKeyBytes
    );
    
    return { valid, attestation: att.attestationJson };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}`;

interface ApiResponse {
  data?: unknown;
  error?: { code: string; message: string };
}

export default function IntegratorsPage() {
  const [searchResult, setSearchResult] = useState<ApiResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [keysResult, setKeysResult] = useState<ApiResponse | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);

  const trySearchApi = async () => {
    setSearchLoading(true);
    try {
      const res = await fetch(`${API_URL}/v1/tokens?symbol=TEST&chain_id=1`);
      const data = await res.json();
      setSearchResult(data);
    } catch (err) {
      setSearchResult({ error: { code: 'FETCH_ERROR', message: String(err) } });
    } finally {
      setSearchLoading(false);
    }
  };

  const tryKeysApi = async () => {
    setKeysLoading(true);
    try {
      const res = await fetch(`${API_URL}/v1/keys`);
      const data = await res.json();
      setKeysResult(data);
    } catch (err) {
      setKeysResult({ error: { code: 'FETCH_ERROR', message: String(err) } });
    } finally {
      setKeysLoading(false);
    }
  };

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Integration Guide
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-3xl">
          Use our public API to display verification badges in your wallet, DEX, or tracker.
          All endpoints return JSON and require no authentication for read operations.
        </p>
      </div>

      {/* Quick Start */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Quick Start
        </h2>
        <div className="card">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Base URL</h3>
              <div className="flex items-center gap-2">
                <code className="code-inline flex-1 truncate">{API_URL}</code>
                <CopyButton text={API_URL} />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Response Format</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                All responses: <code className="code-inline">{`{ data: ..., error?: { code, message } }`}</code>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* API Reference */}
      <section id="examples">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          API Examples
        </h2>

        {/* Search Tokens */}
        <div className="card mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Search Tokens
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Search by symbol and chain. Results are sorted with verified tokens first.
              </p>
            </div>
            <span className="badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              GET
            </span>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Endpoint</span>
              <CopyButton text={`${API_URL}/v1/tokens?symbol=USDT&chain_id=1`} />
            </div>
            <code className="block code-block text-sm">
              GET /v1/tokens?symbol=USDT&chain_id=1
            </code>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Code Example</span>
              <CopyButton text={SEARCH_EXAMPLE} />
            </div>
            <pre className="code-block text-xs overflow-x-auto">{SEARCH_EXAMPLE}</pre>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={trySearchApi} disabled={searchLoading} className="btn btn-secondary btn-sm">
              {searchLoading ? <Spinner size="sm" /> : 'Try it'}
            </button>
            {searchResult && (
              <button
                onClick={() => downloadJson(searchResult, 'search-result.json')}
                className="btn btn-ghost btn-sm"
              >
                Download JSON
              </button>
            )}
          </div>

          {searchResult && (
            <div className="mt-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Response</span>
              <pre className="code-block text-xs overflow-x-auto max-h-48">
                {JSON.stringify(searchResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Get Public Keys */}
        <div className="card mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Get Public Keys
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Fetch public keys used to sign attestations. Use these to verify signatures.
              </p>
            </div>
            <span className="badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              GET
            </span>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Endpoint</span>
              <CopyButton text={`${API_URL}/v1/keys`} />
            </div>
            <code className="block code-block text-sm">
              GET /v1/keys
            </code>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={tryKeysApi} disabled={keysLoading} className="btn btn-secondary btn-sm">
              {keysLoading ? <Spinner size="sm" /> : 'Try it'}
            </button>
            {keysResult && (
              <button
                onClick={() => downloadJson(keysResult, 'public-keys.json')}
                className="btn btn-ghost btn-sm"
              >
                Download JSON
              </button>
            )}
          </div>

          {keysResult && (
            <div className="mt-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Response</span>
              <pre className="code-block text-xs overflow-x-auto max-h-48">
                {JSON.stringify(keysResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Get Attestation */}
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Get Attestation
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Fetch the signed attestation for a specific token.
              </p>
            </div>
            <span className="badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              GET
            </span>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Endpoint</span>
              <CopyButton text={`${API_URL}/v1/attestations/:chainId/:contractAddress`} />
            </div>
            <code className="block code-block text-sm">
              GET /v1/attestations/:chainId/:contractAddress
            </code>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Code Example</span>
              <CopyButton text={ATTESTATION_EXAMPLE} />
            </div>
            <pre className="code-block text-xs overflow-x-auto">{ATTESTATION_EXAMPLE}</pre>
          </div>
        </div>
      </section>

      {/* Signature Verification */}
      <section id="verification">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Verifying Attestation Signatures
        </h2>

        <Alert type="info" title="Ed25519 Signatures">
          All attestations are signed using Ed25519. We recommend using
          the <code className="code-inline">@noble/ed25519</code> library for verification.
        </Alert>

        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Complete Verification Example (TypeScript)
            </h3>
            <CopyButton text={VERIFY_SIGNATURE_CODE} />
          </div>
          <pre className="code-block text-xs overflow-x-auto">{VERIFY_SIGNATURE_CODE}</pre>
        </div>
      </section>

      {/* Best Practices */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Best Practices
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              Caching
            </h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Cache attestations for 1 hour (tier changes are rare)
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Cache public keys for 24 hours (rotations are announced)
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Use <code className="code-inline">If-None-Match</code> headers for efficient cache validation
              </li>
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              Key Rotation
            </h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                We may rotate signing keys periodically
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Old keys remain valid for existing attestations
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Always fetch the key matching <code className="code-inline">publicKeyId</code>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Display Guidelines */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Display Guidelines
        </h2>
        <div className="card">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            When displaying verification status, use consistent visual indicators:
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge badge-verified">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  Verified
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                tier = &quot;verified&quot;
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge badge-deployer">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  Deployer
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                tier = &quot;deployer_verified&quot;
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge badge-unverified">
                  Unverified
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                tier = &quot;unverified&quot; or missing
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Rate Limits */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Rate Limits
        </h2>
        <div className="card">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            To ensure fair access, we apply the following rate limits:
          </p>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Endpoint Type</th>
                  <th>Limit</th>
                  <th>Window</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Public read endpoints (/v1/tokens, /v1/attestations)</td>
                  <td>100 requests</td>
                  <td>per minute</td>
                </tr>
                <tr>
                  <td>Public keys (/v1/keys)</td>
                  <td>20 requests</td>
                  <td>per minute</td>
                </tr>
                <tr>
                  <td>Write endpoints (verification requests)</td>
                  <td>10 requests</td>
                  <td>per minute</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            Rate limit headers are included in all responses: <code className="code-inline">X-RateLimit-Limit</code>, <code className="code-inline">X-RateLimit-Remaining</code>, <code className="code-inline">X-RateLimit-Reset</code>
          </p>
        </div>
      </section>
    </div>
  );
}
