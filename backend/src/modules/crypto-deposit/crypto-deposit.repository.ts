import type { MasterWalletDepositStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository layer — the ONLY place that talks to Prisma for master-wallet
 * deposits. The credit guard (`markCredited`) is a CONDITIONAL update: it flips
 * to CONFIRMED only from a not-yet-confirmed state, so a repeated submit/recheck
 * can never bind a second ledger transaction.
 */
export const cryptoDepositRepository = {
  findByChainTxHash(chain: string, txHash: string) {
    return prisma.masterWalletDeposit.findUnique({
      where: { chain_txHash: { chain, txHash } },
    });
  },

  findById(id: string) {
    return prisma.masterWalletDeposit.findUnique({ where: { id } });
  },

  findByIdWithUser(id: string) {
    return prisma.masterWalletDeposit.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
  },

  create(data: {
    userId: string;
    assetSymbol: string;
    chain: string;
    masterAddress: string;
    txHash: string;
  }) {
    return prisma.masterWalletDeposit.create({
      data: {
        userId: data.userId,
        assetSymbol: data.assetSymbol,
        chain: data.chain,
        masterAddress: data.masterAddress,
        txHash: data.txHash,
        status: 'SUBMITTED',
      },
    });
  },

  /** Update non-terminal verification fields (PENDING/REJECTED/FAILED paths). */
  update(
    id: string,
    data: {
      status?: MasterWalletDepositStatus;
      amount?: Prisma.Decimal | string | number;
      confirmations?: number;
      fromAddress?: string | null;
      logIndex?: number | null;
      rejectionReason?: string | null;
      rawVerificationSummary?: Prisma.InputJsonValue;
    },
  ) {
    return prisma.masterWalletDeposit.update({ where: { id }, data });
  },

  /**
   * Conditionally flip a deposit to CONFIRMED and bind the crediting ledger
   * txn — only when it is NOT already confirmed. Returns the update count so the
   * caller can detect (count===0) that another pass already credited it.
   */
  markCredited(
    id: string,
    data: {
      ledgerTxnId: string;
      amount: Prisma.Decimal | string | number;
      confirmations: number;
      fromAddress: string | null;
      logIndex: number | null;
      rawVerificationSummary: Prisma.InputJsonValue;
    },
  ) {
    return prisma.masterWalletDeposit.updateMany({
      where: { id, status: { not: 'CONFIRMED' } },
      data: {
        status: 'CONFIRMED',
        creditedLedgerTxnId: data.ledgerTxnId,
        creditedAt: new Date(),
        amount: data.amount,
        confirmations: data.confirmations,
        fromAddress: data.fromAddress,
        logIndex: data.logIndex,
        rejectionReason: null,
        rawVerificationSummary: data.rawVerificationSummary,
      },
    });
  },

  listForUser(input: {
    userId: string;
    status?: MasterWalletDepositStatus;
    chain?: string;
    cursor?: string;
    limit: number;
  }) {
    return prisma.masterWalletDeposit.findMany({
      where: {
        userId: input.userId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.chain ? { chain: input.chain } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
  },

  listForAdmin(input: {
    status?: MasterWalletDepositStatus;
    chain?: string;
    userId?: string;
    txHash?: string;
    fromDate?: Date;
    toDate?: Date;
    cursor?: string;
    limit: number;
  }) {
    const where: Prisma.MasterWalletDepositWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.chain ? { chain: input.chain } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.txHash ? { txHash: input.txHash } : {}),
    };
    if (input.fromDate || input.toDate) {
      where.createdAt = {
        ...(input.fromDate ? { gte: input.fromDate } : {}),
        ...(input.toDate ? { lte: input.toDate } : {}),
      };
    }
    return prisma.masterWalletDeposit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
  },

  /** Admin-side audit row (parallels the kyc/admin-rbac modules). */
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

  /**
   * Upsert the PUBLIC per-chain network config projection from env config.
   * Best-effort persistence for admin visibility; never stores secrets.
   */
  upsertNetworkConfig(data: {
    assetSymbol: string;
    chain: string;
    networkName: string;
    masterAddress: string | null;
    tokenContract: string | null;
    decimals: number;
    minConfirmations: number;
    isEnabled: boolean;
  }) {
    return prisma.depositNetworkConfig.upsert({
      where: { assetSymbol_chain: { assetSymbol: data.assetSymbol, chain: data.chain } },
      update: {
        networkName: data.networkName,
        masterAddress: data.masterAddress,
        tokenContract: data.tokenContract,
        decimals: data.decimals,
        minConfirmations: data.minConfirmations,
        isEnabled: data.isEnabled,
      },
      create: data,
    });
  },
};

export type CryptoDepositRepository = typeof cryptoDepositRepository;
