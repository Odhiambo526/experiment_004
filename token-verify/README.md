# Token Identity Verification

A reputation/attestation layer for disambiguating tokens that share the same ticker symbol.

## What This Is

This system helps UIs (wallets, DEX interfaces, portfolio trackers) distinguish between tokens that share the same symbol. For example, there are many tokens using the "USDT" symbol, but only one is the canonical Tether USD.

**Key point**: We verify identity assertions tied to a specific `(chain_id, contract_address)` pair. We do NOT claim global ticker uniqueness or "ownership" of symbols.

## What This Is NOT

- ❌ A symbol registry that grants exclusive rights to ticker names
- ❌ A pay-to-win verification scheme
- ❌ A guarantee against scams (always verify contract addresses)
- ❌ An integration with external data providers (Dexscreener, Uniswap, etc.)

## Trust Principles

- **Cryptographic proof-of-control**: Verification requires a valid signature from the contract owner or deployer
- **Multiple offchain proofs**: DNS TXT records and GitHub repository proofs link onchain identity to real-world presence
- **Deterministic checks**: All verification checks are reproducible and logged
- **Transparent audit logs**: Every state change is recorded for accountability
- **No pay-to-win**: Proofs cannot be bypassed; fees (if any) are for processing only

## Supported Proofs

| Proof Type | Status | Description |
|------------|--------|-------------|
| **Onchain Signature** | ✅ Supported | EIP-191 signature from owner/deployer |
| **DNS TXT** | ✅ Supported | TXT record at `token-verify.domain.com` |
| **GitHub** | ✅ Supported | File at `.well-known/tokenverif.txt` |
| **X (Twitter)** | 🔜 Future | Requires official API access |

## Verification Tiers

| Tier | Requirements |
|------|-------------|
| **Verified** | Owner signature + 2 offchain proofs (DNS + GitHub) |
| **Deployer Verified** | Deployer signature + 1 offchain proof |
| **Unverified** | Insufficient proofs |

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or use existing container)
- npm

### 1. Install Dependencies

```bash
cd token-verify
npm install
```

### 2. Configure Environment

```bash
# Copy example env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Edit apps/api/.env with your PostgreSQL credentials
# Default expects: postgresql://postgres:postgres@localhost:5432/tokenverify
```

### 3. Set Up Database

If you need a PostgreSQL database:

```bash
# Option A: Docker
docker run --name tokenverify-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=tokenverify \
  -p 5432:5432 \
  -d postgres:14

# Option B: Use existing database
# Update DATABASE_URL in apps/api/.env
```

Create the database and run migrations:

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate
```

### 4. Start Development Servers

```bash
npm run dev
```

This starts:
- **API server**: http://localhost:3001 (and Swagger docs at http://localhost:3001/docs)
- **Web app**: http://localhost:3000

### 5. Try the Demo (DEV_MODE)

With `DEV_MODE=true` in `apps/api/.env`, you can seed demo data:

1. Open http://localhost:3000
2. Click "Seed Demo Data" on the homepage
3. Follow the link to see a pre-configured verification request with mocked valid proofs
4. Click "Run Verification" to complete the demo flow

Or via API:

```bash
# Seed demo data
curl -X POST http://localhost:3001/v1/dev/seed

# Returns: { data: { requestId: "...", projectId: "...", tokenId: "..." } }
```

## API Reference

### Public Read Endpoints (for integrators)

```bash
# Search tokens by symbol (verified first)
GET /v1/tokens?symbol=USDT&chain_id=1

# Get token details with verification status
GET /v1/tokens/:chainId/:contractAddress

# Get signed attestation
GET /v1/attestations/:chainId/:contractAddress

# Get public keys for verifying attestation signatures
GET /v1/keys

# Health check
GET /v1/status
```

### Applicant Endpoints

```bash
# Create project
POST /v1/projects

# Register token
POST /v1/tokens

# Start verification
POST /v1/verification/requests

# Submit proofs
POST /v1/proofs/signature
POST /v1/proofs/dns
POST /v1/proofs/github

# Run verification checks
POST /v1/verification/requests/:id/verify
```

### Development Endpoints (DEV_MODE=true only)

```bash
# Seed demo data
POST /v1/dev/seed

# Clear demo data
POST /v1/dev/clear

# Check dev mode status
GET /v1/dev/status
```

## Response Format

All API responses follow this format:

```json
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [{ "field": "...", "message": "..." }]
  }
}
```

## Project Structure

```
token-verify/
├── apps/
│   ├── api/          # Fastify API server (TypeScript)
│   └── web/          # Next.js frontend (App Router)
├── packages/
│   └── shared/       # Shared types, schemas, utilities
├── docs/
│   ├── SPEC.md              # Attestation format specification
│   └── INTEGRATOR_GUIDE.md  # Integration guide for wallets/DEXes
└── README.md
```

## Testing

```bash
# Run all tests
npm run test

# Run specific package tests
npm run test --workspace=apps/api
```

## Environment Variables

### API (`apps/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | API port (default: 3001) |
| `CORS_ORIGIN` | No | Allowed origins (default: http://localhost:3000) |
| `DEV_MODE` | No | Enable dev endpoints (default: false) |
| `GITHUB_TOKEN` | No | GitHub API token for higher rate limits |
| `LOG_LEVEL` | No | Pino log level (default: info) |

### Web (`apps/web/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | API base URL (default: http://localhost:3001) |

## Security Notes

- Signing messages include domain, chain ID, timestamp, and nonce to prevent replay attacks
- Attestations are signed with Ed25519 keys
- Keys can be rotated; old attestations remain valid with archived keys
- All verification artifacts are retained for audit purposes
- Re-verification runs periodically to ensure proofs remain valid

## Limitations

- **No X (Twitter) verification**: Requires official API elevated access
- **Deployer detection**: Relies on user-provided address in MVP
- **No email notifications**: Manual re-verification check required

## License

MIT
