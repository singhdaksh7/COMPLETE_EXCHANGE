import { Prisma, type InrWithdrawal, type InrWithdrawalStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/** Shared filter for the admin withdrawal list. */
export interface AdminWithdrawalFilter {
  status?: InrWithdrawalStatus;
  userId?: string;
  email?: string;
  fromDate?: Date;
  toDate?: Date;
}

function buildAdminWhere(input: AdminWithdrawalFilter): Prisma.InrWithdrawalWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (input.fromDate) createdAt.gte = input.fromDate;
  if (input.toDate) createdAt.lte = input.toDate;
  return {
    ...(input.status ? { status: input.status } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.email ? { user: { email: { contains: input.email } } } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };
}

/**
 * Repository: the ONLY place that talks to Prisma for INR withdrawals. It never
 * mutates balances — locking/releasing/finalizing funds flows exclusively through
 * LedgerService (double-entry). This layer tracks withdrawal STATE and exposes
 * CONDITIONAL transitions (updateMany WHERE status=...) so concurrent
 * approve/reject/mark-paid calls can never double-apply.
 */
export const inrWithdrawalRepository = {
  /** Account + risk state used to gate the request (KYC, status, blocks). */
  findUserState(userId: string) {
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

  create(data: {
    id: string;
    userId: string;
    amount: Prisma.Decimal;
    payoutMethod: 'UPI' | 'BANK';
    upiId?: string | null;
    accountNumberEnc?: Buffer | null;
    accountLast4?: string | null;
    ifsc?: string | null;
    holderName?: string | null;
    bankName?: string | null;
  }): Promise<InrWithdrawal> {
    return prisma.inrWithdrawal.create({
      data: {
        id: data.id,
        userId: data.userId,
        amount: data.amount,
        status: 'PENDING',
        payoutMethod: data.payoutMethod,
        upiId: data.upiId ?? null,
        accountNumberEnc: data.accountNumberEnc ?? null,
        accountLast4: data.accountLast4 ?? null,
        ifsc: data.ifsc ?? null,
        holderName: data.holderName ?? null,
        bankName: data.bankName ?? null,
      },
    });
  },

  findById(id: string): Promise<InrWithdrawal | null> {
    return prisma.inrWithdrawal.findUnique({ where: { id } });
  },

  /** User-scoped lookup — the IDOR guard (404 unless the row is theirs). */
  findByIdForUser(id: string, userId: string): Promise<InrWithdrawal | null> {
    return prisma.inrWithdrawal.findFirst({ where: { id, userId } });
  },

  /** Bind the reserve (lock) ledger txn after a successful posting. */
  setLockTxn(id: string, lockLedgerTxnId: string): Promise<InrWithdrawal> {
    return prisma.inrWithdrawal.update({
      where: { id },
      data: { lockLedgerTxnId },
    });
  },

  /** Roll back a freshly-created PENDING row whose reserve posting failed. */
  async deleteIfPending(id: string): Promise<void> {
    await prisma.inrWithdrawal.deleteMany({ where: { id, status: 'PENDING' } });
  },

  /** PENDING -> APPROVED. Conditional so a double approve flips zero rows. */
  async approve(
    id: string,
    approvedBy: string,
  ): Promise<{ updated: boolean; row: InrWithdrawal | null }> {
    const result = await prisma.inrWithdrawal.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', approvedBy, approvedAt: new Date() },
    });
    const row = await prisma.inrWithdrawal.findUnique({ where: { id } });
    return { updated: result.count === 1, row };
  },

  /** {PENDING,APPROVED} -> REJECTED. Conditional so a double reject is a no-op. */
  async reject(
    id: string,
    reviewedBy: string,
    reason: string,
  ): Promise<{ updated: boolean; row: InrWithdrawal | null }> {
    const result = await prisma.inrWithdrawal.updateMany({
      where: { id, status: { in: ['PENDING', 'APPROVED'] } },
      data: {
        status: 'REJECTED',
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    const row = await prisma.inrWithdrawal.findUnique({ where: { id } });
    return { updated: result.count === 1, row };
  },

  /** APPROVED -> PAID. Conditional so a double mark-paid finalizes once. */
  async markPaid(
    id: string,
    data: { paidBy: string; utr: string; finalLedgerTxnId: string; note?: string },
  ): Promise<{ updated: boolean; row: InrWithdrawal | null }> {
    const result = await prisma.inrWithdrawal.updateMany({
      where: { id, status: 'APPROVED' },
      data: {
        status: 'PAID',
        paidBy: data.paidBy,
        paidAt: new Date(),
        utr: data.utr,
        finalLedgerTxnId: data.finalLedgerTxnId,
        ...(data.note ? { adminNote: data.note } : {}),
      },
    });
    const row = await prisma.inrWithdrawal.findUnique({ where: { id } });
    return { updated: result.count === 1, row };
  },

  listForUser(input: {
    userId: string;
    status?: InrWithdrawalStatus;
    cursor?: string;
    limit: number;
  }): Promise<InrWithdrawal[]> {
    return prisma.inrWithdrawal.findMany({
      where: {
        userId: input.userId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
    });
  },

  adminList(
    input: AdminWithdrawalFilter & { cursor?: string; limit: number },
  ): Promise<(InrWithdrawal & { user: { email: string } })[]> {
    return prisma.inrWithdrawal.findMany({
      where: {
        ...buildAdminWhere(input),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
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

export type InrWithdrawalRepository = typeof inrWithdrawalRepository;
