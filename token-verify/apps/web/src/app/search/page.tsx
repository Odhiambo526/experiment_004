'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { CHAIN_NAMES } from '@token-verify/shared';
import { TierBadge, CopyButton, Spinner, EmptyState, ErrorState, Alert, Skeleton } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const SUPPORTED_CHAINS = Object.entries(CHAIN_NAMES).map(([id, name]) => ({
  id: parseInt(id),
  name,
}));

interface Token {
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
  updatedAt: string;
  project: {
    id: string;
    displayName: string;
  };
}

interface SearchError {
  code: string;
  message: string;
}

export default function SearchPage() {
  const [symbol, setSymbol] = useState('');
  const [chainId, setChainId] = useState<number | ''>('');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const [hasCollisions, setHasCollisions] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!symbol && !chainId) {
      setError({ code: 'VALIDATION', message: 'Please enter a symbol or select a chain' });
      return;
    }

    setLoading(true);
    setSearched(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (symbol) params.set('symbol', symbol.toUpperCase());
      if (chainId) params.set('chain_id', chainId.toString());

      const response = await fetch(`${API_URL}/v1/tokens?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.data) {
        const tokenList = data.data.tokens || [];
        setTokens(tokenList);
        
        // Check for symbol collisions (multiple tokens with same symbol)
        if (symbol && tokenList.length > 1) {
          setHasCollisions(true);
        } else {
          setHasCollisions(false);
        }
      } else {
        setError(data.error || { code: 'UNKNOWN', message: 'Search failed' });
        setTokens([]);
      }
    } catch (err) {
      setError({ code: 'NETWORK', message: 'Failed to connect to API' });
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, chainId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Unknown';
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Search Tokens
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Search by symbol or filter by chain. Verified tokens are shown first.
        </p>
      </div>

      {/* Search Form */}
      <div className="card">
        <div className="grid md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="label">Token Symbol</label>
            <input
              type="text"
              className="input uppercase"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., USDT, ETH, WBTC"
            />
          </div>
          <div>
            <label className="label">Chain</label>
            <select
              className="input"
              value={chainId}
              onChange={(e) => setChainId(e.target.value ? parseInt(e.target.value) : '')}
            >
              <option value="">All Chains</option>
              {SUPPORTED_CHAINS.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              className="btn btn-primary w-full"
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner size="sm" />
                  Searching...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Collision Warning */}
      {hasCollisions && !loading && (
        <Alert type="warning" title="Multiple Tokens Found">
          <p>
            Multiple tokens share the symbol <strong>{symbol.toUpperCase()}</strong>. 
            This is common and expected. Verified tokens are shown first. 
            <strong> Always verify the contract address</strong> before interacting with any token.
          </p>
        </Alert>
      )}

      {/* Error State */}
      {error && (
        <ErrorState 
          title="Search Failed" 
          message={error.message} 
          onRetry={handleSearch}
        />
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="flex items-start gap-4">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-1/3 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {searched && !loading && !error && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {tokens.length} {tokens.length === 1 ? 'Result' : 'Results'}
            </h2>
            {tokens.length > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sorted by verification tier
              </p>
            )}
          </div>

          {tokens.length === 0 ? (
            <EmptyState
              title="No tokens found"
              description="Try a different symbol or chain filter"
              action={
                <button onClick={() => { setSymbol(''); setChainId(''); setSearched(false); }} className="btn btn-secondary">
                  Clear Search
                </button>
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Badge</th>
                    <th>Token</th>
                    <th>Project</th>
                    <th>Contract</th>
                    <th>Chain</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id}>
                      <td>
                        <TierBadge tier={token.verificationTier} />
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          {token.logoUrl ? (
                            <img
                              src={token.logoUrl}
                              alt={token.symbol}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <span className="text-sm font-bold text-gray-500">
                                {token.symbol[0]}
                              </span>
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {token.symbol}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {token.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-gray-600 dark:text-gray-400">
                        {token.project.displayName}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                            {truncateAddress(token.contractAddress)}
                          </code>
                          <CopyButton text={token.contractAddress} label="" />
                        </div>
                      </td>
                      <td className="text-gray-600 dark:text-gray-400">
                        {token.chainName}
                      </td>
                      <td className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(token.updatedAt)}
                      </td>
                      <td>
                        <Link
                          href={`/token/${token.chainId}/${token.contractAddress}`}
                          className="btn btn-ghost btn-sm"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Collision Example (shown before search) */}
      {!searched && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
            Understanding Token Collisions
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Many tokens share the same symbol. When you search, you may find multiple results.
            Our verification helps you identify which token belongs to which project.
          </p>
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <TierBadge tier="verified" />
              <code className="text-xs font-mono text-gray-600 dark:text-gray-400">
                0xdAC17F958D2ee523a2206206994597C13D831ec7
              </code>
              <span className="text-gray-600 dark:text-gray-400 text-sm">
                Tether USD (Official)
              </span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <TierBadge tier="unverified" />
              <code className="text-xs font-mono text-gray-600 dark:text-gray-400">
                0x1234567890abcdef1234567890abcdef12345678
              </code>
              <span className="text-gray-600 dark:text-gray-400 text-sm">
                Unknown USDT
              </span>
            </div>
          </div>
          <Alert type="info">
            Verification does not prevent others from using the same symbol. 
            Always verify the contract address matches what you expect.
          </Alert>
        </div>
      )}
    </div>
  );
}
