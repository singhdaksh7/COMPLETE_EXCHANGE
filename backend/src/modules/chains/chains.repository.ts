import type { CryptoWithdrawal, WithdrawalStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Read-only repository for the multi-chain admin surface. It reads existing
 * reference + ledger-adjacent tables (chains, asset_chains, chain_cursors,
 * crypto_withdrawals) — it NEVER moves money and exposes no key material.
 */
export const chainsRepository = {
  listChains() {
    return prisma.chain.findMany({
      orderBy: { id: 'asc' },
      include: {
        cursor: true,
        assetChains: { where: { isActive: true }, orderBy: { asset: 'asc' } },
      },
    });
  },

  findChain(id: string) {
    return prisma.chain.findUnique({
      where: { id },
      include: { cursor: true, assetChains: { where: { isActive: true } } },
    });
  },

  listWithdrawals(input: {
    chain: string;
    status?: WithdrawalStatus;
    cursor?: string;
    limit: number;
  }): Promise<CryptoWithdrawal[]> {
    return prisma.cryptoWithdrawal.findMany({
      where: {
        chain: input.chain,
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },
};

export type ChainsRepository = typeof chainsRepository;
