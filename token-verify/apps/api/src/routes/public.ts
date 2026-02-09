// Token Identity Verification - Public Read API Routes
// Read-only endpoints for integrators (wallets, DEX UIs, trackers)

import type { FastifyInstance } from 'fastify';
import { tokenListQuerySchema, VerificationTier, CHAIN_NAMES } from '@token-verify/shared';
import { db } from '../lib/db.js';
import { Errors } from '../lib/error-handler.js';

export async function publicRoutes(app: FastifyInstance) {
  /**
   * List tokens with optional filters
   * This is the main endpoint for collision resolution
   */
  app.get(
    '/tokens',
    {
      schema: {
        tags: ['Public'],
        summary: 'List tokens',
        description: `
          Returns tokens matching the query. Multiple tokens can share the same symbol.
          Results are sorted with verified tokens first, then by name.
          
          **Collision Resolution**: When a user searches for "USDT", this endpoint
          may return multiple tokens with that symbol. Integrators should:
          1. Display the verification tier prominently
          2. Show "Verified" badge only for tier=verified or tier=deployer_verified
          3. Allow users to see all options, not just verified ones
        `,
        querystring: {
          type: 'object',
          properties: {
            chain_id: { type: 'number' },
            symbol: { type: 'string' },
            tier: { type: 'string', enum: Object.values(VerificationTier) },
            page: { type: 'number', minimum: 1, default: 1 },
            page_size: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request) => {
      const query = tokenListQuerySchema.parse({
        chainId: (request.query as Record<string, unknown>).chain_id,
        symbol: (request.query as Record<string, unknown>).symbol,
        tier: (request.query as Record<string, unknown>).tier,
        page: (request.query as Record<string, unknown>).page,
        pageSize: (request.query as Record<string, unknown>).page_size,
      });

      // Build where clause
      const where: {
        chainId?: number;
        symbol?: { equals: string; mode: 'insensitive' };
      } = {};

      if (query.chainId) {
        where.chainId = query.chainId;
      }

      if (query.symbol) {
        where.symbol = { equals: query.symbol.toUpperCase(), mode: 'insensitive' };
      }

      // Get tokens with their latest attestations
      const [tokens, total] = await Promise.all([
        db.token.findMany({
          where,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            project: {
              select: { id: true, displayName: true },
            },
            attestations: {
              where: { revokedAt: null },
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                attestationJson: true,
              },
            },
          },
          orderBy: [
            { symbol: 'asc' },
            { name: 'asc' },
          ],
        }),
        db.token.count({ where }),
      ]);

      // Extract verification tiers and sort
      const tokensWithTier = tokens.map((token) => {
        const attestation = token.attestations[0];
        let tier = VerificationTier.UNVERIFIED;
        
        if (attestation) {
          const data = attestation.attestationJson as { verification?: { tier?: string } };
          tier = (data.verification?.tier as VerificationTier) ?? VerificationTier.UNVERIFIED;
        }

        return {
          id: token.id,
          chainId: token.chainId,
          chainName: CHAIN_NAMES[token.chainId] ?? `Chain ${token.chainId}`,
          contractAddress: token.contractAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoUrl: token.logoUrl,
          websiteUrl: token.websiteUrl,
          verificationTier: tier,
          project: token.project,
        };
      });

      // Sort with verified first
      const tierOrder = {
        [VerificationTier.VERIFIED]: 0,
        [VerificationTier.DEPLOYER_VERIFIED]: 1,
        [VerificationTier.UNVERIFIED]: 2,
      };

      tokensWithTier.sort((a, b) => {
        const tierDiff = tierOrder[a.verificationTier] - tierOrder[b.verificationTier];
        if (tierDiff !== 0) return tierDiff;
        return a.name.localeCompare(b.name);
      });

      // Filter by tier if requested
      let filteredTokens = tokensWithTier;
      if (query.tier) {
        filteredTokens = tokensWithTier.filter((t) => t.verificationTier === query.tier);
      }

      return {
        success: true,
        data: {
          tokens: filteredTokens,
          pagination: {
            total,
            page: query.page,
            pageSize: query.pageSize,
            hasMore: query.page * query.pageSize < total,
          },
          _info: {
            note: 'Verification does not prevent others from using the same symbol. It helps users identify the canonical token for a project.',
            tiers: {
              verified: 'Full verification: owner signature + 2 offchain proofs',
              deployer_verified: 'Deployer verification: deployer signature + 1 offchain proof',
              unverified: 'No valid verification proofs',
            },
          },
        },
      };
    }
  );

  /**
   * Get token by chain and address with full details
   */
  app.get(
    '/tokens/:chainId/:contractAddress',
    {
      schema: {
        tags: ['Public'],
        summary: 'Get token details',
        description: 'Returns full token details including verification status and attestation',
        params: {
          type: 'object',
          required: ['chainId', 'contractAddress'],
          properties: {
            chainId: { type: 'string' },
            contractAddress: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { chainId, contractAddress } = request.params as {
        chainId: string;
        contractAddress: string;
      };

      // Validate chainId is a valid integer
      const parsedChainId = parseInt(chainId, 10);
      if (isNaN(parsedChainId) || parsedChainId <= 0) {
        throw Errors.badRequest('Invalid chain ID', [{ field: 'chainId', message: 'Must be a positive integer' }]);
      }

      // Validate contract address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        throw Errors.badRequest('Invalid contract address format', [{ field: 'contractAddress', message: 'Must be a valid Ethereum address' }]);
      }

      const token = await db.token.findUnique({
        where: {
          chainId_contractAddress: {
            chainId: parsedChainId,
            contractAddress: contractAddress.toLowerCase(),
          },
        },
        include: {
          project: {
            select: { id: true, displayName: true, description: true },
          },
          attestations: {
            where: { revokedAt: null },
            orderBy: { version: 'desc' },
            take: 1,
          },
          verificationRequests: {
            where: { status: 'APPROVED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              proofs: {
                select: {
                  type: true,
                  status: true,
                  checkedAt: true,
                },
              },
            },
          },
        },
      });

      if (!token) {
        throw Errors.notFound('Token');
      }

      const attestation = token.attestations[0];
      let tier = VerificationTier.UNVERIFIED;
      let attestationData = null;

      if (attestation) {
        const data = attestation.attestationJson as { verification?: { tier?: string } };
        tier = (data.verification?.tier as VerificationTier) ?? VerificationTier.UNVERIFIED;
        attestationData = {
          data: attestation.attestationJson,
          signature: attestation.signature,
          publicKeyId: attestation.publicKeyId,
          issuedAt: attestation.issuedAt.toISOString(),
          version: attestation.version,
        };
      }

      const verificationRequest = token.verificationRequests[0];

      return {
        success: true,
        data: {
          token: {
            id: token.id,
            chainId: token.chainId,
            chainName: CHAIN_NAMES[token.chainId] ?? `Chain ${token.chainId}`,
            contractAddress: token.contractAddress,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            logoUrl: token.logoUrl,
            websiteUrl: token.websiteUrl,
            createdAt: token.createdAt.toISOString(),
          },
          project: token.project,
          verification: {
            tier,
            isVerified: tier === VerificationTier.VERIFIED || tier === VerificationTier.DEPLOYER_VERIFIED,
            proofs: verificationRequest?.proofs.map((p) => ({
              type: p.type,
              status: p.status,
              checkedAt: p.checkedAt?.toISOString(),
            })) ?? [],
          },
          attestation: attestationData,
          _info: {
            verifyAttestation: attestationData
              ? `To verify: fetch public key from /v1/keys/${attestationData.publicKeyId}, then verify Ed25519 signature over the attestation JSON.`
              : null,
          },
        },
      };
    }
  );

  /**
   * Search tokens
   */
  app.get(
    '/search',
    {
      schema: {
        tags: ['Public'],
        summary: 'Search tokens',
        description: 'Search tokens by symbol or name',
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 50 },
            chain_id: { type: 'number' },
            limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          },
        },
      },
    },
    async (request) => {
      const { q, chain_id, limit = 10 } = request.query as {
        q: string;
        chain_id?: number;
        limit?: number;
      };

      const searchTerm = q.toUpperCase();

      const where: {
        OR: Array<{ symbol: { contains: string; mode: 'insensitive' } } | { name: { contains: string; mode: 'insensitive' } }>;
        chainId?: number;
      } = {
        OR: [
          { symbol: { contains: searchTerm, mode: 'insensitive' } },
          { name: { contains: searchTerm, mode: 'insensitive' } },
        ],
      };

      if (chain_id) {
        where.chainId = chain_id;
      }

      const tokens = await db.token.findMany({
        where,
        take: limit,
        include: {
          project: {
            select: { id: true, displayName: true },
          },
          attestations: {
            where: { revokedAt: null },
            orderBy: { version: 'desc' },
            take: 1,
            select: { attestationJson: true },
          },
        },
      });

      const results = tokens.map((token) => {
        const attestation = token.attestations[0];
        let tier = VerificationTier.UNVERIFIED;

        if (attestation) {
          const data = attestation.attestationJson as { verification?: { tier?: string } };
          tier = (data.verification?.tier as VerificationTier) ?? VerificationTier.UNVERIFIED;
        }

        return {
          id: token.id,
          chainId: token.chainId,
          chainName: CHAIN_NAMES[token.chainId] ?? `Chain ${token.chainId}`,
          contractAddress: token.contractAddress,
          symbol: token.symbol,
          name: token.name,
          verificationTier: tier,
          project: token.project,
        };
      });

      // Sort with verified first
      results.sort((a, b) => {
        if (a.verificationTier === VerificationTier.VERIFIED && b.verificationTier !== VerificationTier.VERIFIED) return -1;
        if (b.verificationTier === VerificationTier.VERIFIED && a.verificationTier !== VerificationTier.VERIFIED) return 1;
        return 0;
      });

      return {
        success: true,
        data: {
          query: q,
          results,
        },
      };
    }
  );
}
