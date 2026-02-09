// Token Identity Verification - Onchain Signature Verification Service
// Handles EIP-191 signature verification and owner/deployer detection

import { ethers, JsonRpcProvider, Contract } from 'ethers';
import { CHAIN_RPC_ENDPOINTS, APP_DOMAIN } from '@token-verify/shared';
import { generateSigningMessage } from '@token-verify/shared';
import { logger } from '../lib/logger.js';

/**
 * Ownable interface ABI (EIP-173 compatible)
 */
const OWNABLE_ABI = [
  'function owner() view returns (address)',
];

/**
 * Result of signature verification
 */
export interface SignatureVerificationResult {
  isValid: boolean;
  recoveredAddress: string;
  expectedAddress: string;
  verificationTier: 'owner' | 'deployer' | 'unknown';
  contractType: 'ownable' | 'eip173' | 'none';
  error?: string;
}

/**
 * Get JSON RPC provider for a chain
 */
function getProvider(chainId: number): JsonRpcProvider {
  const rpcUrl = process.env[`RPC_URL_${chainId}`] || CHAIN_RPC_ENDPOINTS[chainId];
  if (!rpcUrl) {
    throw new Error(`No RPC endpoint configured for chain ${chainId}`);
  }
  return new JsonRpcProvider(rpcUrl);
}

/**
 * Try to get the owner address of a contract
 * Returns null if the contract doesn't implement Ownable/EIP-173
 */
async function getContractOwner(
  chainId: number,
  contractAddress: string
): Promise<string | null> {
  try {
    const provider = getProvider(chainId);
    const contract = new Contract(contractAddress, OWNABLE_ABI, provider);
    const owner = await contract.owner();
    return owner.toLowerCase();
  } catch (error) {
    // Contract doesn't implement owner() or call failed
    logger.debug({ chainId, contractAddress, error }, 'Failed to get contract owner');
    return null;
  }
}

/**
 * Get the deployer address of a contract by looking at the first transaction
 * 
 * ASSUMPTION: We use a simple heuristic - get the contract creation tx.
 * This may not work for all chains or contract types (e.g., CREATE2, proxies).
 * In production, consider using block explorer APIs or indexer services.
 */
async function getContractDeployer(
  chainId: number,
  contractAddress: string
): Promise<string | null> {
  try {
    const provider = getProvider(chainId);
    
    // Get the contract code to verify it exists
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      logger.warn({ chainId, contractAddress }, 'Contract code not found');
      return null;
    }

    // LIMITATION: Getting deployer address reliably requires either:
    // 1. An indexer/explorer API (etherscan, etc.)
    // 2. Tracing the deployment transaction
    // 
    // For MVP, we'll use a simplified approach:
    // - Accept deployer address as user input
    // - Verify they can sign for it
    // - Mark as "deployer_verified" tier
    //
    // In production, integrate with block explorer APIs to verify deployer.
    
    return null;
  } catch (error) {
    logger.error({ chainId, contractAddress, error }, 'Failed to get deployer');
    return null;
  }
}

/**
 * Verify an EIP-191 personal_sign signature
 */
export async function verifySignature(params: {
  chainId: number;
  contractAddress: string;
  signature: string;
  requestId: string;
  nonce: string;
  timestamp: number;
  claimedAddress?: string; // Optional: the address the user claims to control
}): Promise<SignatureVerificationResult> {
  const { chainId, contractAddress, signature, requestId, nonce, timestamp, claimedAddress } = params;

  try {
    // Generate the expected message
    const message = generateSigningMessage({
      domain: APP_DOMAIN,
      chainId,
      contractAddress: contractAddress.toLowerCase(),
      timestamp,
      nonce,
      requestId,
    });

    // Recover the signer address from the signature
    const recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();
    logger.debug({ recoveredAddress, message }, 'Recovered address from signature');

    // Try to get the contract owner
    const ownerAddress = await getContractOwner(chainId, contractAddress);
    logger.debug({ ownerAddress }, 'Contract owner address');

    // Determine verification tier
    if (ownerAddress) {
      // Contract implements Ownable/EIP-173
      if (recoveredAddress === ownerAddress) {
        return {
          isValid: true,
          recoveredAddress,
          expectedAddress: ownerAddress,
          verificationTier: 'owner',
          contractType: 'ownable',
        };
      } else {
        return {
          isValid: false,
          recoveredAddress,
          expectedAddress: ownerAddress,
          verificationTier: 'unknown',
          contractType: 'ownable',
          error: `Signature is from ${recoveredAddress}, but contract owner is ${ownerAddress}`,
        };
      }
    }

    // Contract doesn't implement owner() - check if user claims to be deployer
    if (claimedAddress && recoveredAddress === claimedAddress.toLowerCase()) {
      // User signed with the address they claimed
      // This results in "deployer_verified" tier
      return {
        isValid: true,
        recoveredAddress,
        expectedAddress: claimedAddress.toLowerCase(),
        verificationTier: 'deployer',
        contractType: 'none',
      };
    }

    // No owner function and no valid claimed address
    return {
      isValid: false,
      recoveredAddress,
      expectedAddress: claimedAddress?.toLowerCase() || '',
      verificationTier: 'unknown',
      contractType: 'none',
      error: 'Could not verify ownership. Contract does not implement owner() function.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, params }, 'Signature verification failed');
    
    return {
      isValid: false,
      recoveredAddress: '',
      expectedAddress: '',
      verificationTier: 'unknown',
      contractType: 'none',
      error: `Signature verification failed: ${errorMessage}`,
    };
  }
}

/**
 * Get contract information for a token
 */
export async function getContractInfo(chainId: number, contractAddress: string) {
  const owner = await getContractOwner(chainId, contractAddress);
  
  return {
    hasOwner: owner !== null,
    owner,
    contractType: owner ? 'ownable' : 'none',
  };
}
