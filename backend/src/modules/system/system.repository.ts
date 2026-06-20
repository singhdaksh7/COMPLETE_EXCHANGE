import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the admin System / Ops Center (Stage 4.3).
 *
 * READ-ONLY: every method here is a count/aggregate over existing tables for
 * operational observability. It NEVER writes, credits, approves, or mutates any
 * business state, and it returns only coarse operational data (counts, ids,
 * amounts) — never secrets, PII beyond ids, or raw provider material.
 */

/** Withdrawal statuses that still sit in the admin queue (awaiting work). */
const WITHDRAWAL_QUEUE_STATUSES = [
  'REQUESTED',
  'RISK_CHECK',
  'PENDING_APPROVAL',
  'APPROVED',
  'QUEUED',
] as const;

/** KYC states that count as "awaiting compliance review". */
const KYC_PENDING_STATUSES = ['PENDING', 'IN_REVIEW', 'MANUAL_REVIEW'] as const;

export interface LargePendingWithdrawal {
  id: string;
  userId: string;
  asset: string;
  chain: string;
  amount: string;
  status: string;
  requestedAt: Date;
}

export const systemRepository = {
  // ------------------------------------------------------------------
  // Operational queues
  // ------------------------------------------------------------------

  /** Manual INR deposits awaiting an admin decision (provider = MANUAL). */
  countPendingManualInrDeposits(): Promise<number> {
    return prisma.inrTransaction.count({
      where: { type: 'DEPOSIT', provider: 'MANUAL', status: 'PENDING' },
    });
  },

  /**
   * Manual INR deposits in dual-control limbo: a first approver has signed off
   * but the second approval (or rejection) has not landed yet.
   */
  countMakerCheckerPendingDeposits(): Promise<number> {
    return prisma.inrTransaction.count({
      where: {
        type: 'DEPOSIT',
        provider: 'MANUAL',
        status: 'PENDING',
        firstApprovedBy: { not: null },
      },
    });
  },

  /** Crypto withdrawals still in the active admin queue. */
  countPendingWithdrawals(): Promise<number> {
    return prisma.cryptoWithdrawal.count({
      where: { status: { in: [...WITHDRAWAL_QUEUE_STATUSES] } },
    });
  },

  /**
   * Withdrawals in dual-control limbo: first approver recorded, but still
   * sitting in PENDING_APPROVAL awaiting the second approver.
   */
  countMakerCheckerPendingWithdrawals(): Promise<number> {
    return prisma.cryptoWithdrawal.count({
      where: { status: 'PENDING_APPROVAL', approvedBy: { not: null } },
    });
  },

  /** Users whose KYC is awaiting review. */
  countKycPending(): Promise<number> {
    return prisma.kycProfile.count({
      where: { status: { in: [...KYC_PENDING_STATUSES] } },
    });
  },

  /** Users asked for more KYC information. */
  countKycNeedsMoreInfo(): Promise<number> {
    return prisma.kycProfile.count({ where: { status: 'NEEDS_MORE_INFO' } });
  },

  countHighRiskUsers(): Promise<number> {
    return prisma.user.count({ where: { riskLevel: 'HIGH', deletedAt: null } });
  },

  countFrozenUsers(): Promise<number> {
    return prisma.user.count({ where: { status: 'FROZEN', deletedAt: null } });
  },

  countLockedUsers(): Promise<number> {
    return prisma.user.count({ where: { status: 'LOCKED', deletedAt: null } });
  },

  countWithdrawalsBlockedUsers(): Promise<number> {
    return prisma.user.count({
      where: { withdrawalsBlocked: true, deletedAt: null },
    });
  },

  // ------------------------------------------------------------------
  // Risk alerts
  // ------------------------------------------------------------------

  /** Failed or rejected withdrawals since `since`. */
  countFailedRejectedWithdrawalsSince(since: Date): Promise<number> {
    return prisma.cryptoWithdrawal.count({
      where: { status: { in: ['FAILED', 'REJECTED'] }, updatedAt: { gte: since } },
    });
  },

  /** Manual INR deposits still pending and older than `before`. */
  countDepositApprovalsPendingSince(before: Date): Promise<number> {
    return prisma.inrTransaction.count({
      where: {
        type: 'DEPOSIT',
        provider: 'MANUAL',
        status: 'PENDING',
        createdAt: { lt: before },
      },
    });
  },

  /** KYC submissions stuck in review longer than `before`. */
  countKycPendingSince(before: Date): Promise<number> {
    return prisma.kycProfile.count({
      where: {
        status: { in: [...KYC_PENDING_STATUSES] },
        createdAt: { lt: before },
      },
    });
  },

  /** Failed login attempts since `since` (brute-force / credential-stuffing signal). */
  countFailedLoginsSince(since: Date): Promise<number> {
    return prisma.loginAttempt.count({
      where: { success: false, createdAt: { gte: since } },
    });
  },

  /**
   * Pending withdrawals at/above a USDT threshold, newest first. Returns a small
   * capped list with ids/amounts only — no addresses, no user PII.
   */
  async largePendingWithdrawals(
    thresholdUsdt: Prisma.Decimal,
    take: number,
  ): Promise<{ count: number; items: LargePendingWithdrawal[] }> {
    const where: Prisma.CryptoWithdrawalWhereInput = {
      status: { in: [...WITHDRAWAL_QUEUE_STATUSES] },
      amount: { gte: thresholdUsdt },
    };
    const [count, rows] = await Promise.all([
      prisma.cryptoWithdrawal.count({ where }),
      prisma.cryptoWithdrawal.findMany({
        where,
        orderBy: { amount: 'desc' },
        take,
        select: {
          id: true,
          userId: true,
          asset: true,
          chain: true,
          amount: true,
          status: true,
          requestedAt: true,
        },
      }),
    ]);
    return {
      count,
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        asset: r.asset,
        chain: r.chain,
        amount: r.amount.toFixed(),
        status: r.status,
        requestedAt: r.requestedAt,
      })),
    };
  },

  // ------------------------------------------------------------------
  // Mail / notification delivery health
  // ------------------------------------------------------------------

  /**
   * Coarse notification email-delivery counts (SENT / LOGGED / SKIPPED / FAILED)
   * since `since`. Never carries message bodies or recipient addresses.
   */
  async notificationEmailStatusCountsSince(
    since: Date,
  ): Promise<Record<string, number>> {
    const rows = await prisma.notification.groupBy({
      by: ['emailStatus'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r.emailStatus) out[r.emailStatus] = r._count._all;
    }
    return out;
  },
};

export type SystemRepository = typeof systemRepository;
