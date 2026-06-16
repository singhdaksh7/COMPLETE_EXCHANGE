import {
  Prisma,
  type AccountKind,
  type HotWallet,
  type TreasuryTransferStatus,
  type TreasuryTransferType,
  type WalletTier,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository: the ONLY place that talks to Prisma for treasury custody
 * (hot/cold wallet registry reads, treasury_transfers, and the HOT_WALLET /
 * COLD_WALLET system-account balance reads). It NEVER moves balances — money
 * movement goes through LedgerService — and NEVER stores key material.
 */
export const treasuryRepository = {
  // ------------------------------------------------------------------
  // Wallet registry (read-only; cold = tier COLD)
  // ------------------------------------------------------------------
  listWalletsByTier(filter: { tiers: WalletTier[]; chain?: string }) {
    return prisma.hotWallet.findMany({
      where: {
        tier: { in: filter.tiers },
        ...(filter.chain ? { chain: filter.chain } : {}),
      },
      include: { signer: true, nonce: true },
      orderBy: [{ chain: 'asc' }, { tier: 'asc' }, { address: 'asc' }],
    });
  },

  findWalletById(id: string): Promise<HotWallet | null> {
    return prisma.hotWallet.findUnique({ where: { id } });
  },

  countWallets() {
    return prisma.hotWallet.groupBy({
      by: ['tier', 'isActive'],
      _count: { _all: true },
    });
  },

  /** Active asset_chain support row for (chain, asset), if depositable. */
  async assetSupportedOnChain(chain: string, asset: string): Promise<boolean> {
    const count = await prisma.assetChain.count({
      where: {
        chain,
        asset,
        isActive: true,
        assetRef: { isActive: true },
        chainRef: { isActive: true },
      },
    });
    return count > 0;
  },

  // ------------------------------------------------------------------
  // Custody ledger balances (HOT_WALLET / COLD_WALLET system accounts)
  // ------------------------------------------------------------------
  async systemBalance(kind: AccountKind, asset: string): Promise<Prisma.Decimal> {
    const account = await prisma.account.findFirst({
      where: { kind, userId: null, asset },
      include: { balance: true },
    });
    return account?.balance?.balance ?? new Prisma.Decimal(0);
  },

  /** All custody account balances (HOT_WALLET + COLD_WALLET) grouped by asset. */
  async custodyBalances(): Promise<
    Array<{ asset: string; kind: AccountKind; balance: Prisma.Decimal }>
  > {
    const accounts = await prisma.account.findMany({
      where: { kind: { in: ['HOT_WALLET', 'COLD_WALLET'] }, userId: null },
      include: { balance: true },
    });
    return accounts.map((a) => ({
      asset: a.asset,
      kind: a.kind,
      balance: a.balance?.balance ?? new Prisma.Decimal(0),
    }));
  },

  // ------------------------------------------------------------------
  // Treasury transfers
  // ------------------------------------------------------------------
  createTransfer(data: {
    type: TreasuryTransferType;
    chain: string;
    asset: string;
    fromWalletId: string;
    toWalletId: string;
    amount: Prisma.Decimal;
    reason?: string | null;
    requestedBy: string;
  }) {
    return prisma.treasuryTransfer.create({ data });
  },

  findTransferById(id: string) {
    return prisma.treasuryTransfer.findUnique({
      where: { id },
      include: { fromWallet: true, toWallet: true },
    });
  },

  listTransfers(filter: {
    type?: TreasuryTransferType;
    status?: TreasuryTransferStatus;
    chain?: string;
    asset?: string;
    cursor?: string;
    limit: number;
  }) {
    return prisma.treasuryTransfer.findMany({
      where: {
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.chain ? { chain: filter.chain } : {}),
        ...(filter.asset ? { asset: filter.asset } : {}),
        ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
      },
      include: { fromWallet: true, toWallet: true },
      orderBy: { id: 'desc' },
      take: filter.limit + 1,
    });
  },

  countByStatus(status: TreasuryTransferStatus): Promise<number> {
    return prisma.treasuryTransfer.count({ where: { status } });
  },

  /**
   * Record the first approval in a dual-control flow WITHOUT executing: claims
   * PENDING_APPROVAL only when not yet approved. Returns the affected count.
   */
  recordFirstApproval(id: string, adminId: string) {
    return prisma.treasuryTransfer.updateMany({
      where: { id, status: 'PENDING_APPROVAL', approvedBy: null },
      data: { approvedBy: adminId, approvedAt: new Date() },
    });
  },

  /**
   * Atomically claim a PENDING_APPROVAL transfer for execution so two approvers
   * cannot double-execute. `secondApprover` is set only in dual-control.
   */
  claimForExecution(id: string, adminId: string, secondApprover: boolean) {
    return prisma.treasuryTransfer.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: secondApprover
        ? { approvedBy2: adminId, status: 'APPROVED', approvedAt: new Date() }
        : { approvedBy: adminId, status: 'APPROVED', approvedAt: new Date() },
    });
  },

  /** Mark an APPROVED transfer COMPLETED with its ledger txn + mock tx hash. */
  completeTransfer(
    id: string,
    data: { ledgerTxnId: string; txHash: string; nonce?: bigint | null },
  ) {
    return prisma.treasuryTransfer.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        ledgerTxnId: data.ledgerTxnId,
        txHash: data.txHash,
        nonce: data.nonce ?? null,
        completedAt: new Date(),
      },
    });
  },

  failTransfer(id: string, reason: string) {
    return prisma.treasuryTransfer.update({
      where: { id },
      data: { status: 'FAILED', failureReason: reason },
    });
  },

  /** Reject a PENDING_APPROVAL transfer (guarded so it cannot race execution). */
  rejectTransfer(id: string, adminId: string, reason: string) {
    return prisma.treasuryTransfer.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: { status: 'REJECTED', rejectedBy: adminId, failureReason: reason },
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

export type TreasuryRepository = typeof treasuryRepository;
