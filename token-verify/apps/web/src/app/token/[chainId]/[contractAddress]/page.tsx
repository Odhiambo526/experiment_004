'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TierBadge, CopyButton, Spinner, ErrorState, Skeleton, Alert } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TokenDetails {
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
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    displayName: string;
    description: string | null;
  };
  attestation?: {
    attestationJson: object;
    signature: string;
    publicKeyId: string;
    issuedAt: string;
  };
}

export default function TokenDetailPage() {
  const params = useParams();
  const chainId = params.chainId as string;
  const contractAddress = params.contractAddress as string;

  const [token, setToken] = useState<TokenDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/v1/tokens/${chainId}/${contractAddress}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Token not found');
        }

        setToken(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load token');
      } finally {
        setLoading(false);
      }
    };

    fetchToken();
  }, [chainId, contractAddress]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Skeleton className="h-8 w-1/3 mb-2" />
          <Skeleton className="h-5 w-2/3" />
        </div>
        <div className="card">
          <Skeleton className="h-6 w-1/4 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorState
          title="Token not found"
          message={error || 'This token does not exist in our records.'}
        />
        <div className="mt-6 text-center">
          <Link href="/search" className="text-primary-600 hover:underline">
            ← Back to Search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        {token.logoUrl ? (
          <img
            src={token.logoUrl}
            alt={token.symbol}
            className="w-16 h-16 rounded-full"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-2xl font-bold text-gray-500">{token.symbol[0]}</span>
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {token.name}
            </h1>
            <TierBadge tier={token.verificationTier} />
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {token.symbol} • {token.chainName}
          </p>
        </div>
      </div>

      {/* Verification Notice */}
      {token.verificationTier === 'verified' ? (
        <Alert type="success" title="Verified Token">
          This token has been verified with full verification (owner signature + DNS + GitHub proofs).
        </Alert>
      ) : token.verificationTier === 'deployer_verified' ? (
        <Alert type="warning" title="Deployer Verified">
          This token has been verified at the deployer level (deployer signature + at least 1 offchain proof).
        </Alert>
      ) : (
        <Alert type="info" title="Unverified Token">
          This token has not been verified. Always verify the contract address before interacting.
        </Alert>
      )}

      {/* Token Details */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Token Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="md:col-span-2">
            <dt className="text-gray-500 dark:text-gray-400">Contract Address</dt>
            <dd className="flex items-center gap-2 mt-1">
              <code className="code-inline text-xs">{token.contractAddress}</code>
              <CopyButton text={token.contractAddress} label="" />
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Chain</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
              {token.chainName} (Chain ID: {token.chainId})
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Decimals</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
              {token.decimals ?? 'Unknown'}
            </dd>
          </div>
          {token.websiteUrl && (
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Website</dt>
              <dd className="mt-1">
                <a
                  href={token.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  {token.websiteUrl}
                </a>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Last Updated</dt>
            <dd className="mt-1 text-gray-900 dark:text-white">
              {formatDate(token.updatedAt)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Project Info */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Project</h2>
        <div className="text-sm">
          <p className="font-medium text-gray-900 dark:text-white">
            {token.project.displayName}
          </p>
          {token.project.description && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {token.project.description}
            </p>
          )}
        </div>
      </div>

      {/* Attestation (if verified) */}
      {token.attestation && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Attestation</h2>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label">Attestation JSON</span>
                <CopyButton text={JSON.stringify(token.attestation.attestationJson, null, 2)} />
              </div>
              <pre className="code-block text-xs max-h-48 overflow-y-auto">
                {JSON.stringify(token.attestation.attestationJson, null, 2)}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label">Signature</span>
                <CopyButton text={token.attestation.signature} />
              </div>
              <code className="code-block text-xs break-all">
                {token.attestation.signature}
              </code>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400 block">Public Key ID</span>
                <code className="code-inline text-xs">{token.attestation.publicKeyId}</code>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block">Issued</span>
                <span className="text-gray-900 dark:text-white">
                  {formatDate(token.attestation.issuedAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Link href="/integrators#verification" className="text-primary-600 hover:underline text-sm">
              Learn how to verify this attestation →
            </Link>
          </div>
        </div>
      )}

      {/* Back Link */}
      <div className="text-center pt-4">
        <Link href="/search" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          ← Back to Search
        </Link>
      </div>
    </div>
  );
}
