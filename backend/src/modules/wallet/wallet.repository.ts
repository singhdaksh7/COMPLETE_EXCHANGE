import {
  Prisma,
  type Chain,
  type DepositAddress,
  type WalletTier,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { toChainSignerRef } from './wallet.types';
import type { ChainSignerRef } from './providers/chain-signer.provider';

type Tx = Prisma.TransactionClient;

/**
 * Repository layer: the ONLY place that talks to Prisma for wallet
 * infrastructure (deposit addresses, reference chains/assets, hot-wallet and
 * signer registries, nonce lookups). The schema is frozen — this layer only
 * reads/writes existing tables and NEVER stores key material.
 */
export const walletRepository = {
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  },

  // ------------------------------------------------------------------
  // Reference data — chains & supported asset_chains
  // ------------------------------------------------------------------
  findActiveChain(chain: string): Promise<Chain | null> {
    return prisma.chain.findFirst({ where: { id: chain, isActive: true } });
  },

  /** Active asset_chains (with chain ref) — the supported deposit networks. */
  listSupportedNetworks(filter: { chain?: string } = {}) {
    return prisma.assetChain.findMany({
      where: {
        isActive: true,
        assetRef: { isActive: true },
        chainRef: { isActive: true },
        ...(filter.chain ? { chain: filter.chain } : {}),
      },
      include: { chainRef: true },
      orderBy: [{ asset: 'asc' }, { chain: 'asc' }],
    });
  },

  /** True when the chain has at least one active, depositable asset. */
  async chainHasSupportedAsset(chain: string): Promise<boolean> {
    const count = await prisma.assetChain.count({
      where: {
        chain,
        isActive: true,
        assetRef: { isActive: true },
        chainRef: { isActive: true },
      },
    });
    return count > 0;
  },

  // ------------------------------------------------------------------
  // Deposit addresses
  // ------------------------------------------------------------------
  findActiveAddress(
    userId: string,
    chain: string,
    client: Tx | typeof prisma = prisma,
  ): Promise<DepositAddress | null> {
    return client.depositAddress.findFirst({
      where: { userId, chain, isActive: true },
    });
  },

  listUserAddresses(
    userId: string,
    filter: { chain?: string } = {},
  ): Promise<DepositAddress[]> {
    return prisma.depositAddress.findMany({
      where: { userId, ...(filter.chain ? { chain: filter.chain } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Next global HD derivation index for a chain (unique per chain). */
  async nextDerivationIndex(chain: string, client: Tx): Promise<bigint> {
    const max = await client.depositAddress.aggregate({
      where: { chain },
      _max: { derivationIndex: true },
    });
    return (max._max.derivationIndex ?? -1n) + 1n;
  },

  createAddress(
    data: {
      userId: string;
      chain: string;
      address: string;
      derivationIndex: bigint;
    },
    client: Tx,
  ): Promise<DepositAddress> {
    return client.depositAddress.create({ data });
  },

  // ------------------------------------------------------------------
  // Hot wallets / signers / nonces (read-only registries)
  // ------------------------------------------------------------------
  listHotWallets(filter: { chain?: string; tier?: WalletTier } = {}) {
    return prisma.hotWallet.findMany({
      where: {
        ...(filter.chain ? { chain: filter.chain } : {}),
        ...(filter.tier ? { tier: filter.tier } : {}),
      },
      include: { signer: true, nonce: true },
      orderBy: [{ chain: 'asc' }, { tier: 'asc' }],
    });
  },

  getWalletNonce(hotWalletId: string) {
    return prisma.walletNonce.findUnique({ where: { hotWalletId } });
  },

  listChainSigners(filter: { chain?: string } = {}) {
    return prisma.chainSigner.findMany({
      where: { ...(filter.chain ? { chain: filter.chain } : {}) },
      orderBy: [{ chain: 'asc' }, { name: 'asc' }],
    });
  },

  /** Active signer for a chain, mapped to the safe (key-free) ref. */
  async findActiveSigner(chain: string): Promise<ChainSignerRef | null> {
    const signer = await prisma.chainSigner.findFirst({
      where: { chain, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return signer ? toChainSignerRef(signer) : null;
  },

  // ------------------------------------------------------------------
  // Admin monitoring
  // ------------------------------------------------------------------
  adminListDepositAddresses(filter: {
    chain?: string;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<DepositAddress[]> {
    return prisma.depositAddress.findMany({
      where: {
        ...(filter.chain ? { chain: filter.chain } : {}),
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: filter.limit + 1,
    });
  },

  writeAdminLog(data: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    beforeState?: Prisma.InputJsonValue;
    afterState?: Prisma.InputJsonValue;
    ip?: string;
    requestId?: string;
  }) {
    return prisma.adminLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        beforeState: data.beforeState,
        afterState: data.afterState,
        ip: data.ip,
        requestId: data.requestId,
      },
    });
  },
};

export type WalletRepository = typeof walletRepository;
