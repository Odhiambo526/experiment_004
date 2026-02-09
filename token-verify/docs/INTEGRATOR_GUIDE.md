# Token Identity Verification - Integrator Guide

This guide helps wallet developers, DEX interfaces, and portfolio trackers integrate with the Token Identity Verification API.

## Quick Start

### Base URL

```
Production: https://api.tokenverify.app (example)
Development: http://localhost:3001
```

### Basic Token Lookup

```bash
# Get verification status for a specific token
curl "https://api.tokenverify.app/v1/tokens/1/0xdac17f958d2ee523a2206206994597c13d831ec7"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": {
      "id": "tok_abc123",
      "chainId": 1,
      "chainName": "Ethereum Mainnet",
      "contractAddress": "0xdac17f958d2ee523a2206206994597c13d831ec7",
      "symbol": "USDT",
      "name": "Tether USD",
      "decimals": 6,
      "logoUrl": "https://...",
      "websiteUrl": "https://tether.to"
    },
    "project": {
      "id": "proj_xyz",
      "displayName": "Tether"
    },
    "verification": {
      "tier": "verified",
      "isVerified": true,
      "proofs": [
        { "type": "ONCHAIN_SIGNATURE", "status": "VALID" },
        { "type": "DNS_TXT", "status": "VALID" },
        { "type": "GITHUB_REPO", "status": "VALID" }
      ]
    },
    "hasAttestation": true
  }
}
```

## Use Cases

### 1. Token Collision Resolution

When a user searches for "USDT", multiple tokens may match. Use the API to show verified tokens first.

```bash
curl "https://api.tokenverify.app/v1/tokens?symbol=USDT&chain_id=1"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokens": [
      {
        "symbol": "USDT",
        "name": "Tether USD",
        "contractAddress": "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "verificationTier": "verified",
        "project": { "displayName": "Tether" }
      },
      {
        "symbol": "USDT",
        "name": "Fake USDT",
        "contractAddress": "0x1234567890123456789012345678901234567890",
        "verificationTier": "unverified",
        "project": { "displayName": "Unknown" }
      }
    ],
    "pagination": { "total": 2, "page": 1, "hasMore": false }
  }
}
```

**UI Recommendation:**
- Show verified tokens at the top
- Display a "Verified" badge prominently
- Always show the contract address
- Warn users about unverified tokens

### 2. Display Verification Badge

```javascript
function getVerificationBadge(tier) {
  switch (tier) {
    case 'verified':
      return { label: 'Verified', color: 'green', icon: '✓' };
    case 'deployer_verified':
      return { label: 'Deployer Verified', color: 'yellow', icon: '◐' };
    default:
      return { label: 'Unverified', color: 'gray', icon: '?' };
  }
}
```

### 3. Verify Attestation Signature

For high-security use cases, verify the attestation signature:

```javascript
import * as ed from '@noble/ed25519';

async function verifyTokenAttestation(chainId, contractAddress) {
  // 1. Fetch attestation
  const attestationRes = await fetch(
    `https://api.tokenverify.app/v1/attestations/${chainId}/${contractAddress}`
  );
  const { data } = await attestationRes.json();
  
  // 2. Fetch public key
  const keyRes = await fetch(
    `https://api.tokenverify.app/v1/keys/${data.publicKeyId}`
  );
  const { data: keyData } = await keyRes.json();
  
  // 3. Verify signature
  const message = new TextEncoder().encode(JSON.stringify(data.attestation));
  const signature = Buffer.from(data.signature, 'base64');
  const publicKey = Buffer.from(keyData.publicKey, 'base64');
  
  const isValid = await ed.verifyAsync(signature, message, publicKey);
  
  return {
    isValid,
    attestation: data.attestation,
    tier: data.attestation.verification.tier
  };
}
```

## API Reference

### GET /v1/tokens

List and search tokens.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Filter by symbol (case-insensitive) |
| `chain_id` | number | Filter by chain ID |
| `tier` | string | Filter by verification tier |
| `page` | number | Page number (default: 1) |
| `page_size` | number | Results per page (max: 100) |

### GET /v1/tokens/:chainId/:contractAddress

Get token details by chain and address.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | number | Chain ID (e.g., 1 for Ethereum) |
| `contractAddress` | string | Token contract address |

### GET /v1/attestations/:chainId/:contractAddress

Get signed attestation for a verified token.

**Response includes:**
- `attestation` - The signed data bundle
- `signature` - Base64-encoded Ed25519 signature
- `publicKeyId` - ID of signing key
- `issuedAt` - When attestation was created

### GET /v1/keys

Get public keys for attestation verification.

**Response includes:**
- `keys[]` - Array of public keys with IDs and metadata
- `usage` - Instructions for verification

### GET /v1/keys/:id

Get a specific public key by ID.

### GET /v1/search

Search tokens by name or symbol.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |
| `chain_id` | number | Optional chain filter |
| `limit` | number | Max results (default: 10) |

### GET /v1/status

Health check endpoint.

## Re-verification and Status Changes

Verified tokens are periodically re-checked to ensure proofs remain valid. Understanding the re-verification system helps you build robust integrations.

### Token Re-verification Status

Tokens have a `reverifyStatus` field that indicates their current state:

| Status | Description |
|--------|-------------|
| `ok` | All proofs valid, token is verified |
| `failing` | Recent re-verification failed, but within grace period |
| `grace` | Failed re-verification, in grace period (7 days before downgrade) |
| `revoked` | Verification revoked due to repeated failures |

### What Happens When Proofs Fail

1. **First failure**: Status becomes `failing`, grace period starts
2. **Second failure**: Stays in grace period, scheduled for earlier re-check
3. **Third consecutive failure**: Status becomes `revoked`, attestation revoked

### Recommendations

- Check `reverifyStatus` in token responses if available
- If status is `grace` or `failing`, the verification may be temporary
- Revoked tokens should be treated as unverified
- Cache verification status but refresh periodically (hourly recommended)

## Key Rotation

Public keys used for attestation signatures may be rotated periodically for security. Your integration should handle key rotation gracefully.

### How Key Rotation Works

1. New keys are added with `isActive: true`
2. Old keys are retired (`isActive: false`) but kept for verification of existing attestations
3. Attestations reference their signing key via `publicKeyId`

### Handling Key Rotation

```javascript
// Maintain a local cache of public keys
const keyCache = new Map();

async function getPublicKey(publicKeyId) {
  // Check cache first
  if (keyCache.has(publicKeyId)) {
    return keyCache.get(publicKeyId);
  }
  
  // Fetch from API
  const response = await fetch(`/v1/keys/${publicKeyId}`);
  const { data } = await response.json();
  
  // Cache for future use
  keyCache.set(publicKeyId, data);
  return data;
}

// Periodically refresh the full key list
async function refreshKeys() {
  const response = await fetch('/v1/keys');
  const { data } = await response.json();
  
  // Update cache with all active keys
  for (const key of data.keys) {
    keyCache.set(key.id, key);
  }
}
```

### Key Rotation Best Practices

- Poll `/v1/keys` daily to detect new keys
- Keep retired keys in cache for verifying old attestations
- If signature verification fails, refresh keys and retry once
- Log key rotation events for monitoring

## Best Practices

### 1. Cache Responses

Attestations change infrequently. Consider caching with TTL:
- Token list: 5 minutes
- Individual token: 1 hour
- Attestations: 1 hour
- Public keys: 24 hours (but keep cache indefinitely for verification)

### 2. Handle Rate Limits

The API rate limits requests:
- 100 requests/minute for reads
- Exponential backoff on 429 responses

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(1000 * Math.pow(2, i));
      continue;
    }
    return res;
  }
  throw new Error('Rate limited');
}
```

### 3. Graceful Degradation

If the API is unavailable:
- Show tokens without verification badges
- Cache last known verification status
- Log issues but don't break UX

### 4. Display Contract Address

Always show the contract address alongside the symbol:
- Users can verify on block explorer
- Prevents confusion between tokens with same symbol

### 5. Warn on Unverified

When displaying unverified tokens:
```
⚠️ This token is not verified. 
Verification does not guarantee legitimacy, but unverified tokens 
should be treated with extra caution.
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Token not found"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `INVALID_INPUT` | 400 | Invalid request parameters |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Code Examples

### React Component

```jsx
function TokenVerificationBadge({ chainId, contractAddress }) {
  const [status, setStatus] = useState(null);
  
  useEffect(() => {
    fetch(`/v1/tokens/${chainId}/${contractAddress}`)
      .then(res => res.json())
      .then(data => setStatus(data.data.verification.tier))
      .catch(() => setStatus('unknown'));
  }, [chainId, contractAddress]);
  
  if (!status) return <Spinner />;
  
  const badges = {
    verified: { bg: 'green', text: 'Verified' },
    deployer_verified: { bg: 'yellow', text: 'Deployer Verified' },
    unverified: { bg: 'gray', text: 'Unverified' }
  };
  
  const badge = badges[status] || badges.unverified;
  
  return (
    <span className={`badge bg-${badge.bg}`}>
      {badge.text}
    </span>
  );
}
```

### Python Client

```python
import requests
from typing import Optional

class TokenVerifyClient:
    def __init__(self, base_url: str = "https://api.tokenverify.app"):
        self.base_url = base_url
    
    def get_token(self, chain_id: int, address: str) -> dict:
        response = requests.get(
            f"{self.base_url}/v1/tokens/{chain_id}/{address}"
        )
        response.raise_for_status()
        return response.json()["data"]
    
    def search_tokens(
        self, 
        symbol: Optional[str] = None,
        chain_id: Optional[int] = None
    ) -> list:
        params = {}
        if symbol:
            params["symbol"] = symbol
        if chain_id:
            params["chain_id"] = chain_id
        
        response = requests.get(
            f"{self.base_url}/v1/tokens",
            params=params
        )
        response.raise_for_status()
        return response.json()["data"]["tokens"]
    
    def is_verified(self, chain_id: int, address: str) -> bool:
        token = self.get_token(chain_id, address)
        return token["verification"]["tier"] in ["verified", "deployer_verified"]

# Usage
client = TokenVerifyClient()
tokens = client.search_tokens(symbol="USDT", chain_id=1)
verified = [t for t in tokens if t["verificationTier"] == "verified"]
```

## Support

- API Documentation: `/docs` endpoint
- GitHub Issues: [repository]/issues
- Email: support@tokenverify.app (example)

## Changelog

### v1.0.0
- Initial release
- Token verification with onchain signature
- DNS and GitHub proof support
- Ed25519 attestation signing
