import {
  Prisma,
  type AssetChain,
  type ChainCursor,
  type CryptoDeposit,
  type DepositStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository layer: the ONLY place that talks to Prisma for the deposit scanner
 * (chain cursors, crypto_deposits, deposit-address lookups). The schema is
 * frozen; this layer only reads/writes existing tables and NEVER credits
 * balances directly — crediting goes through LedgerService.
 */
export const scannerRepository = {
  // ------------------------------------------------------------------
  // Chain cursor (restart-safe checkpoint, persisted in Postgres)
  // ------------------------------------------------------------------
  getCursor(chain: string): Promise<ChainCursor | null> {
    return prisma.chainCursor.findUnique({ where: { chain } });
  },

  upsertCursor(
    chain: string,
    data: { lastScannedBlock: bigint; lastScannedHash: string | null; safeBlock: bigint },
  ): Promise<ChainCursor> {
    return prisma.chainCursor.upsert({
      where: { chain },
      update: {
        lastScannedBlock: data.lastScannedBlock,
        lastScannedHash: data.lastScannedHash,
        safeBlock: data.safeBlock,
      },
      create: {
        chain,
        lastScannedBlock: data.lastScannedBlock,
        lastScannedHash: data.lastScannedHash,
        safeBlock: data.safeBlock,
      },
    });
  },

  // ------------------------------------------------------------------
  // Reference: supported token (asset_chains) + deposit address set
  // ------------------------------------------------------------------
  async getSupportedToken(
    asset: string,
    chain: string,
  ): Promise<AssetChain | null> {
    const row = await prisma.assetChain.findUnique({
      where: { asset_chain: { asset, chain } },
    });
    if (!row || !row.isActive) return null;
    return row;
  },

  listActiveDepositAddresses(chain: string) {
    return prisma.depositAddress.findMany({
      where: { chain, isActive: true },
      select: { id: true, userId: true, address: true },
    });
  },

  // ------------------------------------------------------------------
  // Detection — idempotent upsert keyed by (chain, tx_hash, log_index)
  // ------------------------------------------------------------------
  async upsertDetectedDeposit(input: {
    chain: string;
    asset: string;
    txHash: string;
    logIndex: number;
    fromAddress: string | null;
    amountBase: Prisma.Decimal;
    amount: Prisma.Decimal;
    blockNumber: bigint;
    blockHash: string;
    reqConfirmations: number;
    userId: string;
    addressId: string;
  }): Promise<{ row: CryptoDeposit; created: boolean }> {
    const key = {
      chain_txHash_logIndex: {
        chain: input.chain,
        txHash: input.txHash,
        logIndex: input.logIndex,
      },
    };
    const existing = await prisma.cryptoDeposit.findUnique({ where: key });
    if (existing) {
      // Never disturb a credited deposit; a reorg that close is negligible.
      if (existing.status === 'CREDITED') return { row: existing, created: false };
      // Refresh block identity (handles a reorg that re-mined the same tx) and
      // attribution; status remains owned by the confirmation pass.
      const row = await prisma.cryptoDeposit.update({
        where: { id: existing.id },
        data: {
          blockNumber: input.blockNumber,
          blockHash: input.blockHash,
          amountBase: input.amountBase,
          amount: input.amount,
          fromAddress: input.fromAddress,
          userId: input.userId,
          addressId: input.addressId,
          // A previously-orphaned tx that reappears returns to DETECTED.
          ...(existing.status === 'ORPHANED'
            ? { status: 'DETECTED' as DepositStatus }
            : {}),
        },
      });
      return { row, created: false };
    }
    try {
      const row = await prisma.cryptoDeposit.create({
        data: {
          chain: input.chain,
          asset: input.asset,
          txHash: input.txHash,
          logIndex: input.logIndex,
          fromAddress: input.fromAddress,
          amountBase: input.amountBase,
          amount: input.amount,
          blockNumber: input.blockNumber,
          blockHash: input.blockHash,
          reqConfirmations: input.reqConfirmations,
          status: 'DETECTED',
          userId: input.userId,
          addressId: input.addressId,
        },
      });
      return { row, created: true };
    } catch (err) {
      // A concurrent scanner won the insert race — treat as already detected.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const row = await prisma.cryptoDeposit.findUniqueOrThrow({ where: key });
        return { row, created: false };
      }
      throw err;
    }
  },

  /**
   * Reorg safety: orphan any non-credited deposit recorded at a block whose
   * canonical hash no longer matches what we stored — it came from a block that
   * was re-organized away, so it must never be credited.
   */
  orphanReorgedDeposits(
    chain: string,
    blockNumber: bigint,
    currentHash: string,
  ): Promise<Prisma.BatchPayload> {
    return prisma.cryptoDeposit.updateMany({
      where: {
        chain,
        blockNumber,
        status: { in: ['DETECTED', 'CONFIRMING', 'CONFIRMED'] },
        NOT: { blockHash: currentHash },
      },
      data: { status: 'ORPHANED' },
    });
  },

  // ------------------------------------------------------------------
  // Confirmation + crediting
  // ------------------------------------------------------------------
  listCreditableCandidates(chain: string): Promise<CryptoDeposit[]> {
    return prisma.cryptoDeposit.findMany({
      where: {
        chain,
        status: { in: ['DETECTED', 'CONFIRMING', 'CONFIRMED'] },
        blockNumber: { not: null },
      },
      orderBy: { blockNumber: 'asc' },
    });
  },

  updateConfirmations(
    id: string,
    data: { confirmations: number; status: DepositStatus },
  ): Promise<CryptoDeposit> {
    return prisma.cryptoDeposit.update({
      where: { id },
      data: { confirmations: data.confirmations, status: data.status },
    });
  },

  /**
   * Flip a deposit to CREDITED exactly once. The `status != CREDITED` guard
   * makes a concurrent/replayed credit a no-op (count 0), so no double-credit.
   */
  markCredited(
    id: string,
    ledgerTxnId: string,
  ): Promise<Prisma.BatchPayload> {
    return prisma.cryptoDeposit.updateMany({
      where: { id, status: { not: 'CREDITED' } },
      data: {
        status: 'CREDITED',
        creditedTxnId: ledgerTxnId,
        creditedAt: new Date(),
      },
    });
  },

  findDepositById(id: string): Promise<CryptoDeposit | null> {
    return prisma.cryptoDeposit.findUnique({ where: { id } });
  },

  // ------------------------------------------------------------------
  // Admin health / monitoring
  // ------------------------------------------------------------------
  async countByStatus(chain: string): Promise<Record<string, number>> {
    const rows = await prisma.cryptoDeposit.groupBy({
      by: ['status'],
      where: { chain },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r._count._all;
    return out;
  },

  adminListDeposits(filter: {
    chain?: string;
    status?: DepositStatus;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<CryptoDeposit[]> {
    return prisma.cryptoDeposit.findMany({
      where: {
        ...(filter.chain ? { chain: filter.chain } : {}),
        ...(filter.status ? { status: filter.status } : {}),
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
    ip?: string;
    requestId?: string;
    afterState?: Prisma.InputJsonValue;
  }) {
    return prisma.adminLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        ip: data.ip,
        requestId: data.requestId,
        afterState: data.afterState,
      },
    });
  },
};

export type ScannerRepository = typeof scannerRepository;
