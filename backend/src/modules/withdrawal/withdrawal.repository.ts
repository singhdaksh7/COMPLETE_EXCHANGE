import {
  Prisma,
  type AssetChain,
  type ChainSigner,
  type CryptoWithdrawal,
  type HotWallet,
  type SystemFlag,
  type TierLimit,
  type WithdrawalAddress,
  type WithdrawalStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

const NON_COUNTING_STATUSES: WithdrawalStatus[] = ['REJECTED', 'FAILED', 'CANCELLED'];
const ACTIVE_QUEUE_STATUSES: WithdrawalStatus[] = [
  'REQUESTED',
  'RISK_CHECK',
  'PENDING_APPROVAL',
  'APPROVED',
  'QUEUED',
];

export type AdminWithdrawalRow = Prisma.CryptoWithdrawalGetPayload<{
  include: {
    user: {
      select: {
        email: true;
        status: true;
        kycStatus: true;
        kycTier: true;
        withdrawalsBlocked: true;
        riskLevel: true;
        riskNote: true;
      };
    };
  };
}>;

/**
 * Repository layer: the ONLY place that talks to Prisma for crypto withdrawals
 * (allowlist, withdrawal rows, hot-wallet/nonce reads). The schema is frozen.
 * This layer NEVER moves balances — every debit/credit goes through
 * LedgerService — it only tracks withdrawal STATE and allocates nonces.
 */
export const withdrawalRepository = {
  // ------------------------------------------------------------------
  // Reference / guards
  // ------------------------------------------------------------------
  findUserKyc(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        kycStatus: true,
        kycTier: true,
        withdrawalsBlocked: true,
        riskLevel: true,
      },
    });
  },

  async getSupportedToken(asset: string, chain: string): Promise<AssetChain | null> {
    const row = await prisma.assetChain.findUnique({
      where: { asset_chain: { asset, chain } },
    });
    if (!row || !row.isActive) return null;
    return row;
  },

  getWithdrawalFreeze(): Promise<SystemFlag | null> {
    return prisma.systemFlag.findUnique({ where: { key: 'withdrawals_frozen' } });
  },

  getTierLimit(kycTier: number): Promise<TierLimit | null> {
    return prisma.tierLimit.findUnique({ where: { kycTier } });
  },

  async sumTodayWithdrawals(userId: string, asset: string): Promise<Prisma.Decimal> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const agg = await prisma.cryptoWithdrawal.aggregate({
      where: {
        userId,
        asset,
        requestedAt: { gte: start },
        status: { notIn: NON_COUNTING_STATUSES },
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? new Prisma.Decimal(0);
  },

  // ------------------------------------------------------------------
  // Allowlist (withdrawal_addresses)
  // ------------------------------------------------------------------
  findActiveAddress(
    userId: string,
    chain: string,
    address: string,
  ): Promise<WithdrawalAddress | null> {
    return prisma.withdrawalAddress.findFirst({
      where: { userId, chain, address, deletedAt: null },
    });
  },

  listAddresses(userId: string, chain?: string): Promise<WithdrawalAddress[]> {
    return prisma.withdrawalAddress.findMany({
      where: { userId, deletedAt: null, ...(chain ? { chain } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  },

  addAddress(data: {
    userId: string;
    chain: string;
    address: string;
    label: string | null;
    whitelistedAt: Date;
  }): Promise<WithdrawalAddress> {
    return prisma.withdrawalAddress.create({ data });
  },

  // ------------------------------------------------------------------
  // Withdrawal rows
  // ------------------------------------------------------------------
  createWithdrawal(data: {
    userId: string;
    chain: string;
    asset: string;
    toAddress: string;
    amount: Prisma.Decimal;
    fee: Prisma.Decimal;
    netAmount: Prisma.Decimal;
    riskFlags?: Prisma.InputJsonValue;
  }): Promise<CryptoWithdrawal> {
    return prisma.cryptoWithdrawal.create({
      data: {
        userId: data.userId,
        chain: data.chain,
        asset: data.asset,
        toAddress: data.toAddress,
        amount: data.amount,
        fee: data.fee,
        netAmount: data.netAmount,
        riskFlags: data.riskFlags,
        status: 'REQUESTED',
      },
    });
  },

  findById(id: string): Promise<CryptoWithdrawal | null> {
    return prisma.cryptoWithdrawal.findUnique({ where: { id } });
  },

  findByIdForUser(id: string, userId: string): Promise<CryptoWithdrawal | null> {
    return prisma.cryptoWithdrawal.findFirst({ where: { id, userId } });
  },

  listUserWithdrawals(input: {
    userId: string;
    status?: WithdrawalStatus;
    cursor?: string;
    limit: number;
  }): Promise<CryptoWithdrawal[]> {
    return prisma.cryptoWithdrawal.findMany({
      where: {
        userId: input.userId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  /** Bind the hold ledger txn and move REQUESTED → PENDING_APPROVAL. */
  setHold(id: string, holdTxnId: string): Promise<CryptoWithdrawal> {
    return prisma.cryptoWithdrawal.update({
      where: { id },
      data: { holdTxnId, status: 'PENDING_APPROVAL' },
    });
  },

  markRequestFailed(id: string, reason: string): Promise<CryptoWithdrawal> {
    return prisma.cryptoWithdrawal.update({
      where: { id },
      data: { status: 'FAILED', failureReason: reason },
    });
  },

  // ---- status transitions (guarded for idempotency) ----
  firstApprove(id: string, adminId: string): Promise<Prisma.BatchPayload> {
    return prisma.cryptoWithdrawal.updateMany({
      where: { id, status: 'PENDING_APPROVAL', approvedBy: null },
      data: { approvedBy: adminId },
    });
  },

  approveSmall(id: string, adminId: string): Promise<Prisma.BatchPayload> {
    return prisma.cryptoWithdrawal.updateMany({
      where: { id, status: 'PENDING_APPROVAL', approvedBy: null },
      data: { status: 'APPROVED', approvedBy: adminId },
    });
  },

  secondApprove(id: string, firstAdminId: string, secondAdminId: string): Promise<Prisma.BatchPayload> {
    return prisma.cryptoWithdrawal.updateMany({
      where: {
        id,
        status: 'PENDING_APPROVAL',
        approvedBy: firstAdminId,
        approvedBy2: null,
        NOT: { approvedBy: secondAdminId },
      },
      data: { status: 'APPROVED', approvedBy2: secondAdminId },
    });
  },

  reject(
    id: string,
    adminId: string,
    reason: string,
  ): Promise<Prisma.BatchPayload> {
    return prisma.cryptoWithdrawal.updateMany({
      where: {
        id,
        status: { in: ['REQUESTED', 'RISK_CHECK', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED'] },
      },
      data: { status: 'REJECTED', approvedBy: adminId, failureReason: reason },
    });
  },

  /** Atomically claim an APPROVED withdrawal for broadcast (→ SIGNING). */
  claimForBroadcast(id: string): Promise<Prisma.BatchPayload> {
    return prisma.cryptoWithdrawal.updateMany({
      where: { id, status: 'APPROVED' },
      data: { status: 'SIGNING' },
    });
  },

  setBroadcast(
    id: string,
    data: {
      hotWalletId: string;
      fromAddress: string;
      nonce: bigint;
      txHash: string;
    },
  ): Promise<CryptoWithdrawal> {
    return prisma.cryptoWithdrawal.update({
      where: { id },
      data: {
        status: 'BROADCAST',
        hotWalletId: data.hotWalletId,
        fromAddress: data.fromAddress,
        nonce: data.nonce,
        txHash: data.txHash,
        broadcastAt: new Date(),
      },
    });
  },

  setConfirming(id: string): Promise<Prisma.BatchPayload> {
    return prisma.cryptoWithdrawal.updateMany({
      where: { id, status: 'BROADCAST' },
      data: { status: 'CONFIRMING' },
    });
  },

  /** Finalize exactly once: count 0 means a peer already completed it. */
  markCompleted(id: string, finalTxnId: string): Promise<Prisma.BatchPayload> {
    return prisma.cryptoWithdrawal.updateMany({
      where: { id, status: { in: ['BROADCAST', 'CONFIRMING'] } },
      data: { status: 'COMPLETED', finalTxnId, completedAt: new Date() },
    });
  },

  markFailed(id: string, reason: string): Promise<Prisma.BatchPayload> {
    return prisma.cryptoWithdrawal.updateMany({
      where: {
        id,
        status: { in: ['SIGNING', 'BROADCAST', 'CONFIRMING', 'APPROVED', 'QUEUED'] },
      },
      data: { status: 'FAILED', failureReason: reason },
    });
  },

  listForBroadcast(chain: string): Promise<CryptoWithdrawal[]> {
    return prisma.cryptoWithdrawal.findMany({
      where: { chain, status: 'APPROVED' },
      orderBy: { requestedAt: 'asc' },
    });
  },

  listForConfirmation(chain: string): Promise<CryptoWithdrawal[]> {
    return prisma.cryptoWithdrawal.findMany({
      where: { chain, status: { in: ['BROADCAST', 'CONFIRMING'] } },
      orderBy: { requestedAt: 'asc' },
    });
  },

  adminListQueue(input: {
    status?: WithdrawalStatus;
    asset?: string;
    userId?: string;
    email?: string;
    fromDate?: Date;
    toDate?: Date;
    cursor?: string;
    limit: number;
  }): Promise<AdminWithdrawalRow[]> {
    const where: Prisma.CryptoWithdrawalWhereInput = input.status
      ? { status: input.status }
      : { status: { in: ACTIVE_QUEUE_STATUSES } };
    const requestedAt: Prisma.DateTimeFilter = {};
    if (input.fromDate) requestedAt.gte = input.fromDate;
    if (input.toDate) requestedAt.lte = input.toDate;
    if (Object.keys(requestedAt).length > 0) where.requestedAt = requestedAt;
    if (input.asset) where.asset = input.asset;
    if (input.userId) where.userId = input.userId;
    if (input.email) where.user = { email: { contains: input.email } };
    if (input.cursor) where.id = { lt: input.cursor };
    return prisma.cryptoWithdrawal.findMany({
      where,
      orderBy: { id: 'desc' },
      take: input.limit + 1,
      include: {
        user: {
          select: {
            email: true,
            status: true,
            kycStatus: true,
            kycTier: true,
            withdrawalsBlocked: true,
            riskLevel: true,
            riskNote: true,
          },
        },
      },
    });
  },

  withdrawalStats() {
    return Promise.all([
      prisma.cryptoWithdrawal.aggregate({
        where: { status: { in: ACTIVE_QUEUE_STATUSES } },
        _sum: { amount: true },
      }),
      prisma.cryptoWithdrawal.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.cryptoWithdrawal.count({
        where: { status: { in: ['FAILED', 'REJECTED'] } },
      }),
      prisma.cryptoWithdrawal.groupBy({
        by: ['asset'],
        where: { status: { in: ACTIVE_QUEUE_STATUSES } },
        _sum: { amount: true },
      }),
    ]).then(([pending, completed, failedRejected, byAsset]) => ({
      pendingTotal: pending._sum.amount ?? new Prisma.Decimal(0),
      completedTotal: completed._sum.amount ?? new Prisma.Decimal(0),
      failedRejectedCount: failedRejected,
      pendingByAsset: byAsset.map((row) => ({
        asset: row.asset,
        amount: row._sum.amount ?? new Prisma.Decimal(0),
      })),
    }));
  },

  // ------------------------------------------------------------------
  // Hot wallet + nonce sequencing (wallet_nonces)
  // ------------------------------------------------------------------
  pickActiveHotWallet(
    chain: string,
  ): Promise<(HotWallet & { signer: ChainSigner | null }) | null> {
    return prisma.hotWallet.findFirst({
      where: { chain, tier: 'HOT', isActive: true },
      include: { signer: true },
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Allocate the next nonce for a hot wallet. The atomic `increment` takes a row
   * lock, so concurrent allocations get distinct nonces; the returned value is
   * the nonce to USE (pre-increment).
   */
  async allocateNonce(hotWalletId: string): Promise<bigint> {
    try {
      const updated = await prisma.walletNonce.update({
        where: { hotWalletId },
        data: { nextNonce: { increment: 1 } },
      });
      return updated.nextNonce - 1n;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        // No nonce row yet — create it starting at 1 and use nonce 0.
        try {
          const created = await prisma.walletNonce.create({
            data: { hotWalletId, nextNonce: 1 },
          });
          return created.nextNonce - 1n;
        } catch (createErr) {
          if (
            createErr instanceof Prisma.PrismaClientKnownRequestError &&
            createErr.code === 'P2002'
          ) {
            const updated = await prisma.walletNonce.update({
              where: { hotWalletId },
              data: { nextNonce: { increment: 1 } },
            });
            return updated.nextNonce - 1n;
          }
          throw createErr;
        }
      }
      throw err;
    }
  },

  countByStatus(chain: string): Promise<Array<{ status: WithdrawalStatus; count: number }>> {
    return prisma.cryptoWithdrawal
      .groupBy({ by: ['status'], where: { chain }, _count: { _all: true } })
      .then((rows) => rows.map((r) => ({ status: r.status, count: r._count._all })));
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

export type WithdrawalRepository = typeof withdrawalRepository;
