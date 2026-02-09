'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge, TierBadge, CopyButton, Spinner, Alert, ProofStatus, ErrorState, Skeleton } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface VerificationRequest {
  id: string;
  status: string;
  nonce: string;
  verificationTier?: string;
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
  attestation?: {
    attestationJson: object;
    signature: string;
    publicKeyId: string;
    issuedAt: string;
  };
}

export default function VerificationRequestPage() {
  const params = useParams();
  const requestId = params.requestId as string;

  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean; tier?: string; message?: string } | null>(null);

  // Proof submission state
  const [signature, setSignature] = useState('');
  const [claimedAddress, setClaimedAddress] = useState('');
  const [domain, setDomain] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [githubRepo, setGithubRepo] = useState('');

  const [activeTab, setActiveTab] = useState<'signature' | 'dns' | 'github'>('signature');

  // Computed values
  const signingMessage = request ? `Token Identity Verification Request

I am the controller of this token contract and request verification.

Domain: tokenverify.app
Chain ID: ${request.token.chainId}
Contract: ${request.token.contractAddress}
Request ID: ${requestId}
Timestamp: ${Date.now()}
Nonce: ${request.nonce}

By signing this message, I confirm that:
1. I have legitimate control over the token contract at the address above.
2. The metadata I submitted is accurate and truthful.
3. I understand that verification does not grant exclusive rights to the token symbol.` : '';

  const dnsRecordValue = request ? `tokenverif:v1:${requestId}:${request.nonce}` : '';
  const githubFileContent = request ? `tokenverif:v1:${requestId}:${request.nonce}` : '';

  const fetchRequest = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/v1/verification/requests/${requestId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to fetch request');
      }

      setRequest(data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }, [requestId]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await fetchRequest();
      setLoading(false);
    };
    fetchData();
  }, [fetchRequest]);

  const getProofStatus = (type: string) => {
    return request?.proofs.find((p) => p.type === type);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const handleSubmitSignature = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/v1/proofs/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationRequestId: requestId,
          signature,
          claimedAddress: claimedAddress || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to submit signature');
      }

      await fetchRequest();
      setSignature('');
      setClaimedAddress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDns = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/v1/proofs/dns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationRequestId: requestId,
          domain,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to submit DNS proof');
      }

      await fetchRequest();
      setDomain('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitGitHub = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/v1/proofs/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationRequestId: requestId,
          owner: githubOwner,
          repo: githubRepo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to submit GitHub proof');
      }

      await fetchRequest();
      setGithubOwner('');
      setGithubRepo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunVerification = async () => {
    setVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      const response = await fetch(`${API_URL}/v1/verification/requests/${requestId}/verify`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Verification failed');
      }

      await fetchRequest();

      if (data.data.isVerified) {
        setVerificationResult({ success: true, tier: data.data.verificationTier });
      } else {
        setVerificationResult({ success: false, message: data.data.error || 'Some proofs are missing or invalid' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setVerifying(false);
    }
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

  if (error && !request) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorState
          title="Failed to load verification request"
          message={error}
          onRetry={fetchRequest}
        />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorState
          title="Request not found"
          message="This verification request does not exist."
        />
      </div>
    );
  }

  const isApproved = request.status === 'APPROVED';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            Verification Request
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {request.token.name} ({request.token.symbol}) • {request.project.displayName}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* Status Banner */}
      {isApproved && request.verificationTier && (
        <Alert type="success" title="Verification Complete">
          <p>
            This token has been verified with tier: <TierBadge tier={request.verificationTier} />
          </p>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert type="error" title="Error">
          {error}
        </Alert>
      )}

      {/* Verification Result */}
      {verificationResult && (
        <Alert 
          type={verificationResult.success ? 'success' : 'warning'} 
          title={verificationResult.success ? 'Verification Successful!' : 'Verification Incomplete'}
        >
          {verificationResult.success ? (
            <p>Token verified with tier: <strong>{verificationResult.tier}</strong></p>
          ) : (
            <p>{verificationResult.message}</p>
          )}
        </Alert>
      )}

      {/* Request Info */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Request Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Request ID</dt>
            <dd className="flex items-center gap-2 mt-1">
              <code className="code-inline text-xs">{request.id}</code>
              <CopyButton text={request.id} label="" />
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Chain</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">Chain ID {request.token.chainId}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-gray-500 dark:text-gray-400">Contract Address</dt>
            <dd className="flex items-center gap-2 mt-1">
              <code className="code-inline text-xs">{request.token.contractAddress}</code>
              <CopyButton text={request.token.contractAddress} label="" />
            </dd>
          </div>
        </dl>
      </div>

      {/* Proofs Summary */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Proof Status</h2>
        <div className="space-y-3">
          {[
            { type: 'ONCHAIN_SIGNATURE', label: 'Onchain Signature', tab: 'signature' as const },
            { type: 'DNS_TXT', label: 'DNS TXT Record', tab: 'dns' as const },
            { type: 'GITHUB_REPO', label: 'GitHub Proof', tab: 'github' as const },
          ].map((proof) => {
            const status = getProofStatus(proof.type);
            return (
              <div
                key={proof.type}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <ProofStatus status={status?.status || 'PENDING'} />
                  <span className="text-gray-900 dark:text-white">{proof.label}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {status?.checkedAt && (
                    <span className="text-gray-500 dark:text-gray-400">
                      Checked: {formatDate(status.checkedAt)}
                    </span>
                  )}
                  <button
                    onClick={() => setActiveTab(proof.tab)}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    {status?.status === 'VALID' ? 'View' : 'Submit'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proof Submission Tabs */}
      {!isApproved && (
        <div className="card">
          <div className="border-b border-gray-200 dark:border-gray-700 mb-6 -mx-6 px-6">
            <nav className="flex gap-6">
              {([
                { id: 'signature', label: 'Onchain Signature' },
                { id: 'dns', label: 'DNS Proof' },
                { id: 'github', label: 'GitHub Proof' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Signature Tab */}
          {activeTab === 'signature' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Sign the Verification Message
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Sign this message with the wallet that owns or deployed your token contract.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="label">Message to Sign</span>
                  <CopyButton text={signingMessage} />
                </div>
                <pre className="code-block text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {signingMessage}
                </pre>
              </div>

              <div>
                <label className="label">Signature (0x...)</label>
                <input
                  type="text"
                  className="input font-mono text-sm"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="0x..."
                />
                <p className="label-hint">
                  Paste the signature you get after signing the message above
                </p>
              </div>

              <div>
                <label className="label">Signer Address (optional)</label>
                <input
                  type="text"
                  className="input font-mono text-sm"
                  value={claimedAddress}
                  onChange={(e) => setClaimedAddress(e.target.value)}
                  placeholder="0x..."
                />
                <p className="label-hint">
                  Required if the contract doesn&apos;t have an owner() function
                </p>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSubmitSignature}
                disabled={!signature || submitting}
              >
                {submitting ? <><Spinner size="sm" /> Submitting...</> : 'Submit Signature'}
              </button>

              {getProofStatus('ONCHAIN_SIGNATURE')?.failureReason && (
                <Alert type="error" title="Signature Verification Failed">
                  {getProofStatus('ONCHAIN_SIGNATURE')?.failureReason}
                </Alert>
              )}
            </div>
          )}

          {/* DNS Tab */}
          {activeTab === 'dns' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Add DNS TXT Record
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Add a TXT record to your domain to prove you control it.
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Record Host</span>
                  <div className="flex items-center gap-2">
                    <code className="code-inline">token-verify.yourdomain.com</code>
                    <CopyButton text="token-verify" label="" />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Record Type</span>
                  <code className="code-inline">TXT</code>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Record Value</span>
                  <div className="flex items-center gap-2">
                    <code className="code-inline text-xs break-all">{dnsRecordValue}</code>
                    <CopyButton text={dnsRecordValue} label="" />
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Your Domain</label>
                <input
                  type="text"
                  className="input"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                />
                <p className="label-hint">
                  Enter your domain (without https:// or www)
                </p>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSubmitDns}
                disabled={!domain || submitting}
              >
                {submitting ? <><Spinner size="sm" /> Verifying...</> : 'Verify DNS'}
              </button>

              {getProofStatus('DNS_TXT')?.failureReason && (
                <Alert type="error" title="DNS Verification Failed">
                  {getProofStatus('DNS_TXT')?.failureReason}
                </Alert>
              )}
            </div>
          )}

          {/* GitHub Tab */}
          {activeTab === 'github' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Add GitHub Proof File
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Add a file to your GitHub repository to prove you control it.
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">File Path</span>
                  <div className="flex items-center gap-2">
                    <code className="code-inline">.well-known/tokenverif.txt</code>
                    <CopyButton text=".well-known/tokenverif.txt" label="" />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">File Content</span>
                  <div className="flex items-center gap-2">
                    <code className="code-inline text-xs break-all">{githubFileContent}</code>
                    <CopyButton text={githubFileContent} label="" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">GitHub Owner/Org</label>
                  <input
                    type="text"
                    className="input"
                    value={githubOwner}
                    onChange={(e) => setGithubOwner(e.target.value)}
                    placeholder="uniswap"
                  />
                </div>
                <div>
                  <label className="label">Repository</label>
                  <input
                    type="text"
                    className="input"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="interface"
                  />
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSubmitGitHub}
                disabled={!githubOwner || !githubRepo || submitting}
              >
                {submitting ? <><Spinner size="sm" /> Verifying...</> : 'Verify GitHub'}
              </button>

              {getProofStatus('GITHUB_REPO')?.failureReason && (
                <Alert type="error" title="GitHub Verification Failed">
                  {getProofStatus('GITHUB_REPO')?.failureReason}
                </Alert>
              )}
            </div>
          )}
        </div>
      )}

      {/* Run Verification */}
      {!isApproved && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            Run Verification Checks
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Once you&apos;ve submitted your proofs, run the verification to complete the process.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleRunVerification}
            disabled={verifying || request.proofs.length === 0}
          >
            {verifying ? <><Spinner size="sm" /> Verifying...</> : 'Run Verification'}
          </button>
        </div>
      )}

      {/* Attestation (if approved) */}
      {isApproved && request.attestation && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Attestation</h2>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label">Attestation JSON</span>
                <CopyButton text={JSON.stringify(request.attestation.attestationJson, null, 2)} />
              </div>
              <pre className="code-block text-xs max-h-64 overflow-y-auto">
                {JSON.stringify(request.attestation.attestationJson, null, 2)}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label">Signature</span>
                <CopyButton text={request.attestation.signature} />
              </div>
              <code className="code-block text-xs break-all">
                {request.attestation.signature}
              </code>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="label">Public Key ID</span>
                <code className="code-inline text-xs">{request.attestation.publicKeyId}</code>
              </div>
              <div>
                <span className="label">Issued At</span>
                <span className="text-gray-900 dark:text-white">
                  {formatDate(request.attestation.issuedAt)}
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
    </div>
  );
}
