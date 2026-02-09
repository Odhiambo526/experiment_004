'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CHAIN_NAMES } from '@token-verify/shared';
import { Spinner, Alert } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const SUPPORTED_CHAINS = Object.entries(CHAIN_NAMES).map(([id, name]) => ({
  id: parseInt(id),
  name,
}));

const STEPS = [
  { id: 1, title: 'Project', description: 'Project details' },
  { id: 2, title: 'Token', description: 'Token information' },
  { id: 3, title: 'Start', description: 'Begin verification' },
];

interface FieldError {
  field: string;
  message: string;
}

export default function VerifyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // Form state
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [chainId, setChainId] = useState<number>(1);
  const [contractAddress, setContractAddress] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [decimals, setDecimals] = useState<number | ''>('');
  const [logoUrl, setLogoUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  // Created IDs
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<string | null>(null);

  // Validation
  const isValidEthAddress = (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address);
  const isValidEmail = (email: string) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidUrl = (url: string) => {
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const step1Valid = useMemo(() => {
    return projectName.length >= 2 && projectName.length <= 100 && isValidEmail(contactEmail);
  }, [projectName, contactEmail]);

  const step2Valid = useMemo(() => {
    return (
      isValidEthAddress(contractAddress) &&
      tokenSymbol.length >= 1 &&
      tokenSymbol.length <= 20 &&
      tokenName.length >= 1 &&
      tokenName.length <= 100 &&
      isValidUrl(logoUrl) &&
      isValidUrl(websiteUrl)
    );
  }, [contractAddress, tokenSymbol, tokenName, logoUrl, websiteUrl]);

  const getFieldError = (field: string) => {
    return fieldErrors.find((e) => e.field === field)?.message;
  };

  const handleCreateProject = async () => {
    setLoading(true);
    setError(null);
    setFieldErrors([]);

    try {
      const response = await fetch(`${API_URL}/v1/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: projectName.trim(),
          description: projectDescription.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.details) {
          setFieldErrors(data.error.details);
        }
        throw new Error(data.error?.message || 'Failed to create project');
      }

      setProjectId(data.data.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateToken = async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);
    setFieldErrors([]);

    try {
      const response = await fetch(`${API_URL}/v1/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          chainId,
          contractAddress: contractAddress.toLowerCase(),
          symbol: tokenSymbol.toUpperCase().trim(),
          name: tokenName.trim(),
          decimals: decimals || undefined,
          logoUrl: logoUrl.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.details) {
          setFieldErrors(data.error.details);
        }
        throw new Error(data.error?.message || 'Failed to create token');
      }

      setTokenId(data.data.id);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleStartVerification = async () => {
    if (!tokenId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/v1/verification/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to create verification request');
      }

      router.push(`/verify/${data.data.requestId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Verify Your Token
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Complete these steps to verify control of your token contract.
      </p>

      {/* Stepper */}
      <div className="flex items-center justify-between mb-8 px-4">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                  step > s.id
                    ? 'bg-green-500 text-white'
                    : step === s.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {step > s.id ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                ) : (
                  s.id
                )}
              </div>
              <span className={`text-xs mt-2 font-medium ${
                step === s.id 
                  ? 'text-primary-600 dark:text-primary-400' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                {s.title}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`w-16 sm:w-24 h-0.5 mx-2 transition-colors ${
                  step > s.id ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error Alert */}
      {error && (
        <Alert type="error" title="Error">
          {error}
        </Alert>
      )}

      {/* Step 1: Project Details */}
      {step === 1 && (
        <div className="card mt-6">
          <div className="card-header -mx-6 -mt-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Project Details
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Tell us about your project. This helps users identify your token.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="label">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`input ${getFieldError('displayName') ? 'input-error' : ''}`}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Uniswap, Chainlink, Aave"
                maxLength={100}
              />
              {getFieldError('displayName') ? (
                <p className="label-error">{getFieldError('displayName')}</p>
              ) : (
                <p className="label-hint">2-100 characters</p>
              )}
            </div>

            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-[100px] resize-none"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Brief description of your project"
                maxLength={500}
              />
              <p className="label-hint">Optional. Max 500 characters.</p>
            </div>

            <div>
              <label className="label">Contact Email</label>
              <input
                type="email"
                className={`input ${getFieldError('contactEmail') || (contactEmail && !isValidEmail(contactEmail)) ? 'input-error' : ''}`}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="team@example.com"
              />
              {contactEmail && !isValidEmail(contactEmail) ? (
                <p className="label-error">Please enter a valid email address</p>
              ) : (
                <p className="label-hint">Optional. Used for verification updates. Not publicly displayed.</p>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              className="btn btn-primary"
              onClick={handleCreateProject}
              disabled={!step1Valid || loading}
            >
              {loading ? (
                <>
                  <Spinner size="sm" />
                  Creating...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Token Details */}
      {step === 2 && (
        <div className="card mt-6">
          <div className="card-header -mx-6 -mt-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Token Details
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Enter the details of the token contract you want to verify.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="label">
                Chain <span className="text-red-500">*</span>
              </label>
              <select
                className="input"
                value={chainId}
                onChange={(e) => setChainId(parseInt(e.target.value))}
              >
                {SUPPORTED_CHAINS.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">
                Contract Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`input font-mono ${
                  contractAddress && !isValidEthAddress(contractAddress) ? 'input-error' : ''
                }`}
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="0x1234567890abcdef1234567890abcdef12345678"
              />
              {contractAddress && !isValidEthAddress(contractAddress) ? (
                <p className="label-error">Please enter a valid Ethereum address (0x followed by 40 hex characters)</p>
              ) : (
                <p className="label-hint">The deployed contract address on the selected chain</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">
                  Symbol <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input uppercase"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value)}
                  placeholder="e.g., UNI"
                  maxLength={20}
                />
                <p className="label-hint">1-20 characters</p>
              </div>

              <div>
                <label className="label">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g., Uniswap Token"
                  maxLength={100}
                />
                <p className="label-hint">1-100 characters</p>
              </div>
            </div>

            <div>
              <label className="label">Decimals</label>
              <input
                type="number"
                className="input"
                value={decimals}
                onChange={(e) => setDecimals(e.target.value ? parseInt(e.target.value) : '')}
                placeholder="18"
                min={0}
                max={18}
              />
              <p className="label-hint">Optional. Usually 18 for ERC-20 tokens.</p>
            </div>

            <div>
              <label className="label">Logo URL</label>
              <input
                type="url"
                className={`input ${logoUrl && !isValidUrl(logoUrl) ? 'input-error' : ''}`}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
              {logoUrl && !isValidUrl(logoUrl) ? (
                <p className="label-error">Please enter a valid URL</p>
              ) : (
                <p className="label-hint">Optional. Direct link to your token logo.</p>
              )}
            </div>

            <div>
              <label className="label">Website URL</label>
              <input
                type="url"
                className={`input ${websiteUrl && !isValidUrl(websiteUrl) ? 'input-error' : ''}`}
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
              {websiteUrl && !isValidUrl(websiteUrl) ? (
                <p className="label-error">Please enter a valid URL</p>
              ) : (
                <p className="label-hint">Optional. Your project website.</p>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-between">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateToken}
              disabled={!step2Valid || loading}
            >
              {loading ? (
                <>
                  <Spinner size="sm" />
                  Creating...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Start Verification */}
      {step === 3 && (
        <div className="card mt-6">
          <div className="card-header -mx-6 -mt-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Ready to Verify
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Your project and token are registered. Start the verification process.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">What happens next:</h3>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center text-sm font-medium">1</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Sign a message</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Use your owner/deployer wallet to sign a verification message</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center text-sm font-medium">2</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Add offchain proofs</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Add DNS TXT record and/or GitHub file to prove domain/repo ownership</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center text-sm font-medium">3</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Get verified</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Once proofs are validated, receive your verification badge and attestation</p>
                </div>
              </li>
            </ol>
          </div>

          <Alert type="info">
            Keep the owner/deployer wallet ready. You will need to sign a message to prove control of the contract.
          </Alert>

          <div className="mt-8 flex justify-between">
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleStartVerification}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner size="sm" />
                  Starting...
                </>
              ) : (
                'Start Verification'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
