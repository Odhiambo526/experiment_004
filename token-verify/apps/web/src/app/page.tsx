'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Spinner } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function HomePage() {
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ success: boolean; requestId?: string; message?: string } | null>(null);

  const handleSeedDemo = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await fetch(`${API_URL}/v1/dev/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.data?.requestId) {
        setSeedResult({ success: true, requestId: data.data.requestId });
      } else {
        setSeedResult({ success: false, message: data.error?.message || 'Failed to seed demo data' });
      }
    } catch (err) {
      setSeedResult({ success: false, message: 'Dev mode not enabled or API unavailable' });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8">
      {/* Hero Section */}
      <section className="py-16 px-4 bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-950">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-6">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            Cryptographic Identity Verification
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Token Identity Verification
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-4 max-w-2xl mx-auto">
            We verify identity assertions tied to <code className="code-inline">(chain_id, contract_address)</code> pairs.
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
            Verification does not grant exclusive symbol rights. Multiple tokens can share the same ticker.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/verify" className="btn btn-primary btn-lg">
              Start Verification
            </Link>
            <Link href="/search" className="btn btn-secondary btn-lg">
              Search Tokens
            </Link>
          </div>

          {/* Demo Flow CTA - Dev Mode Only */}
          <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-w-md mx-auto">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Local development? Try a seeded demo flow:
            </p>
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="btn btn-secondary w-full"
            >
              {seeding ? (
                <>
                  <Spinner size="sm" />
                  Creating demo...
                </>
              ) : (
                'Seed Demo Data'
              )}
            </button>
            {seedResult && (
              <div className="mt-3">
                {seedResult.success ? (
                  <div className="text-sm">
                    <p className="text-green-600 dark:text-green-400 mb-2">Demo created!</p>
                    <Link
                      href={`/verify/${seedResult.requestId}`}
                      className="text-primary-600 hover:underline"
                    >
                      View verification request →
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {seedResult.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* What We Verify */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              What We Verify
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              We perform cryptographic verification of control over both onchain and offchain identities.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Onchain Signature
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                EIP-191 signature from the contract owner (Ownable/EIP-173) or deployer address. Proves control of the smart contract.
              </p>
            </div>
            <div className="card">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                DNS TXT Record
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Add a TXT record to your domain proving you control it. Format: <code className="code-inline">token-verify.yourdomain.com</code>
              </p>
            </div>
            <div className="card">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-primary-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                GitHub Proof
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Add a file at <code className="code-inline">.well-known/tokenverif.txt</code> in your repository to prove control.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Verification Tiers */}
      <section className="py-16 px-4 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Verification Tiers
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Tokens receive a tier based on the proofs successfully verified.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card border-2 border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-4">
                <span className="badge badge-verified">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  Verified
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Full Verification
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Highest trust level. Requires:
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  Valid owner signature (Ownable/EIP-173)
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  At least 2 offchain proofs (DNS + GitHub)
                </li>
              </ul>
            </div>
            <div className="card border-2 border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 mb-4">
                <span className="badge badge-deployer">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  Deployer Verified
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Deployer Level
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                For non-Ownable contracts. Requires:
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  Valid deployer signature
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  At least 1 offchain proof
                </li>
              </ul>
            </div>
            <div className="card border-2 border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <span className="badge badge-unverified">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                  </svg>
                  Unverified
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Not Verified
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                No valid proofs submitted:
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                  Could be legitimate or impostor
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                  Always verify contract address
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Collision Notice */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <Alert type="warning" title="About Symbol Collisions">
            <p>
              <strong>Multiple tokens can share the same symbol.</strong> For example, there are many tokens
              with the symbol &quot;USDT&quot; across different chains and even on the same chain.
            </p>
            <p className="mt-2">
              Our verification helps you identify which token belongs to which project, but it does not
              prevent others from using the same symbol. <strong>Always verify the contract address</strong> matches
              what you expect before interacting with a token.
            </p>
          </Alert>
        </div>
      </section>

      {/* Quick Start for Integrators */}
      <section className="py-16 px-4 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              For Integrators
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Use our public API to display verification badges in your wallet, DEX, or tracker.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Query Token Verification
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Search by symbol and chain. Results are sorted with verified tokens first.
              </p>
              <div className="code-block text-xs">
                <span className="text-green-400">GET</span> /v1/tokens?symbol=USDT&chain_id=1
              </div>
            </div>
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Verify Attestation Signatures
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Fetch signed attestations and verify using our public keys.
              </p>
              <div className="code-block text-xs">
                <span className="text-green-400">GET</span> /v1/attestations/:chainId/:address
              </div>
            </div>
          </div>
          <div className="text-center mt-8">
            <Link href="/integrators" className="btn btn-primary">
              View Full Integration Guide
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
