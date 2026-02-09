# Token Identity Verification - Attestation Specification

Version: 1.0.0

## Overview

This document specifies the attestation format used by the Token Identity Verification system. Attestations are cryptographically signed bundles that assert the verification status of a token.

## Attestation Structure

```typescript
interface Attestation {
  // Attestation format version
  version: string;  // "1.0.0"
  
  // Unix timestamp (milliseconds) when attestation was created
  timestamp: number;
  
  // Token metadata
  token: {
    chainId: number;
    contractAddress: string;  // Lowercase, checksummed
    symbol: string;
    name: string;
    decimals?: number;
    logoUrl?: string;
    websiteUrl?: string;
  };
  
  // Verification details
  verification: {
    tier: "verified" | "deployer_verified" | "unverified";
    requestId: string;
    proofs: Array<{
      type: string;
      status: "valid" | "invalid";
      checkedAt: string;  // ISO 8601
    }>;
  };
  
  // Project information
  project: {
    id: string;
    displayName: string;
    websiteUrl?: string;
  };
}
```

## Verification Tiers

### verified

Full verification achieved when:
- Valid onchain signature from contract `owner()` (Ownable/EIP-173)
- At least 2 valid offchain proofs (DNS + GitHub recommended)

### deployer_verified

Deployer-level verification achieved when:
- Valid onchain signature from contract deployer (no `owner()` function)
- At least 1 valid offchain proof

### unverified

Default state when verification requirements are not met.

## Proof Types

### ONCHAIN_SIGNATURE

EIP-191 `personal_sign` signature proving control of the contract.

**Signing Message Format:**
```
Token Identity Verification Request

I am the controller of this token contract and request verification.

Domain: tokenverify.app
Chain ID: {chainId}
Contract: {contractAddress}
Request ID: {requestId}
Timestamp: {timestamp}
Nonce: {nonce}

By signing this message, I confirm that:
1. I have legitimate control over the token contract at the address above.
2. The metadata I submitted is accurate and truthful.
3. I understand that verification does not grant exclusive rights to the token symbol.
```

**Verification:**
1. Reconstruct the message server-side
2. Recover signer address using `ethers.verifyMessage(message, signature)`
3. Compare recovered address with expected address (owner or deployer)

### DNS_TXT

DNS TXT record proving control of a domain.

**Record Format:**
```
Host: token-verify.{domain}
Type: TXT
Value: tokenverif:v1:{requestId}:{nonce}
```

**Verification:**
1. Query TXT records for `token-verify.{domain}`
2. Check for exact match (case-sensitive) with expected value

### GITHUB_REPO

GitHub repository file proving control of a project.

**File Location:**
```
.well-known/tokenverif.txt
```

**File Content:**
```
tokenverif:v1:{requestId}:{nonce}
```

**Verification:**
1. Fetch file from GitHub API (not scraping)
2. Parse base64-encoded content
3. Check for exact match with expected value

## Signature Format

Attestations are signed using Ed25519 (EdDSA).

### Signing Process

1. Serialize attestation to JSON (canonical, deterministic)
2. Sign JSON string with Ed25519 private key
3. Encode signature as base64

### Verification Process

1. Fetch public key from `/v1/keys/{publicKeyId}`
2. Decode base64 signature and public key
3. Verify signature over attestation JSON string

## API Endpoints

### GET /v1/attestations/{chainId}/{contractAddress}

Returns the latest valid attestation for a token.

**Response:**
```json
{
  "success": true,
  "data": {
    "attestation": { ... },
    "signature": "base64-encoded-signature",
    "publicKeyId": "key_abc123",
    "issuedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### GET /v1/keys

Returns all public keys for signature verification.

**Response:**
```json
{
  "success": true,
  "data": {
    "keys": [
      {
        "id": "key_abc123",
        "algorithm": "Ed25519",
        "publicKey": "base64-encoded-public-key",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "isActive": true
      }
    ],
    "usage": {
      "algorithm": "Ed25519",
      "encoding": "base64",
      "verification": "..."
    }
  }
}
```

### POST /v1/keys/verify

Utility endpoint to verify a signature.

**Request:**
```json
{
  "data": "{attestation-json-string}",
  "signature": "base64-encoded-signature",
  "publicKeyId": "key_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "publicKeyId": "key_abc123"
  }
}
```

## Key Rotation

- Multiple signing keys can exist simultaneously
- Each attestation references the key used via `publicKeyId`
- Old keys are marked as inactive but never deleted
- Attestations signed with retired keys remain valid

## Revocation

Attestations can be revoked:
- If proofs fail re-verification consistently
- If ownership changes (onchain owner change detected)
- Manual revocation by admin (with documented reason)

Revoked attestations include:
```json
{
  "revokedAt": "2024-01-20T15:00:00.000Z",
  "revokedReason": "Ownership changed"
}
```

## Example Implementation (JavaScript)

```javascript
import * as ed from '@noble/ed25519';

async function verifyAttestation(attestation, signature, publicKey) {
  const message = new TextEncoder().encode(JSON.stringify(attestation));
  const sigBytes = Buffer.from(signature, 'base64');
  const pubKeyBytes = Buffer.from(publicKey, 'base64');
  
  return await ed.verifyAsync(sigBytes, message, pubKeyBytes);
}

// Usage
const response = await fetch('/v1/attestations/1/0xdac17...');
const { data } = await response.json();

const keysResponse = await fetch(`/v1/keys/${data.publicKeyId}`);
const { data: keyData } = await keysResponse.json();

const isValid = await verifyAttestation(
  data.attestation,
  data.signature,
  keyData.publicKey
);

console.log('Attestation valid:', isValid);
```

## Security Considerations

1. **Message Binding**: Signing messages include domain, chain ID, timestamp, nonce to prevent:
   - Cross-domain replay
   - Cross-chain replay
   - Timestamp-based replay
   - Nonce-based replay

2. **Deterministic Checks**: All proof verifications are reproducible:
   - DNS queries are logged with results
   - GitHub API responses are stored
   - Signature recovery is deterministic

3. **Audit Trail**: Every verification action is logged:
   - Actor (system, applicant, reviewer)
   - Action type
   - Timestamp
   - Result and metadata

4. **Key Security**: Private keys should be:
   - Encrypted at rest
   - Stored in HSM/KMS in production
   - Rotated periodically

## Versioning

The attestation format version follows semantic versioning:
- Major: Breaking changes to structure
- Minor: Backward-compatible additions
- Patch: Clarifications, no data changes

Integrators should check `attestation.version` and handle appropriately.
