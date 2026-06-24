import { Prisma, type AdminNotification } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 8B admin notification center.
 *
 * Notifications are DERIVED from real operational state by an idempotent refresh
 * (createMany skipDuplicates on the unique dedupe_key), so the table only ever
 * reflects real signals and never produces duplicates. Read state persists
 * across refreshes.
 */

export interface NotificationCandidate {
  dedupeKey: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  targetType?: string;
  targetId?: string;
}

/** Per-category cap so a refresh can never insert an unbounded number of rows. */
const SCAN_LIMIT = 50;

export const adminNotificationRepository = {
  /** Insert any candidates whose dedupeKey does not already exist. */
  async insertNew(candidates: NotificationCandidate[]): Promise<number> {
    if (candidates.length === 0) return 0;
    const res = await prisma.adminNotification.createMany({
      data: candidates.map((c) => ({
        type: c.type,
        severity: c.severity,
        title: c.title,
        message: c.message,
        targetType: c.targetType ?? null,
        targetId: c.targetId ?? null,
        dedupeKey: c.dedupeKey,
      })),
      skipDuplicates: true,
    });
    return res.count;
  },

  list(input: {
    unreadOnly?: boolean;
    type?: string;
    cursor?: string;
    limit: number;
  }): Promise<AdminNotification[]> {
    return prisma.adminNotification.findMany({
      where: {
        ...(input.unreadOnly ? { isRead: false } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
  },

  unreadCount(): Promise<number> {
    return prisma.adminNotification.count({ where: { isRead: false } });
  },

  findById(id: string): Promise<AdminNotification | null> {
    return prisma.adminNotification.findUnique({ where: { id } });
  },

  async markRead(id: string, adminId: string | null): Promise<number> {
    const res = await prisma.adminNotification.updateMany({
      where: { id, isRead: false },
      data: { isRead: true, readAt: new Date(), readByAdminId: adminId },
    });
    return res.count;
  },

  async markAllRead(adminId: string | null): Promise<number> {
    const res = await prisma.adminNotification.updateMany({
      where: { isRead: false },
      data: { isRead: true, readAt: new Date(), readByAdminId: adminId },
    });
    return res.count;
  },

  // ----------------------------------------------------------------
  // Operational signal scans (read-only). Each returns the rows that
  // SHOULD have a notification right now; the service maps them to
  // candidates with a deterministic dedupeKey.
  // ----------------------------------------------------------------

  pendingKycUsers() {
    return prisma.user.findMany({
      where: { deletedAt: null, kycStatus: { in: ['PENDING', 'IN_REVIEW', 'MANUAL_REVIEW'] } },
      select: { id: true, email: true, kycStatus: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN_LIMIT,
    });
  },

  pendingInrByType(type: 'DEPOSIT' | 'WITHDRAWAL') {
    return prisma.inrTransaction.findMany({
      where: { type, status: { in: ['INITIATED', 'PENDING'] } },
      select: { id: true, userId: true, amount: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN_LIMIT,
    });
  },

  cryptoWithdrawalsForReview() {
    return prisma.cryptoWithdrawal.findMany({
      where: { status: { in: ['RISK_CHECK', 'PENDING_APPROVAL'] } },
      select: { id: true, userId: true, asset: true, amount: true },
      orderBy: { requestedAt: 'desc' },
      take: SCAN_LIMIT,
    });
  },

  openCases() {
    return prisma.complianceCase.findMany({
      where: { status: { in: ['OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED'] } },
      select: { id: true, userId: true, title: true, priority: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN_LIMIT,
    });
  },

  highRiskUsers() {
    return prisma.user.findMany({
      where: { deletedAt: null, riskLevel: 'HIGH' },
      select: { id: true, email: true },
      orderBy: { updatedAt: 'desc' },
      take: SCAN_LIMIT,
    });
  },

  walletRiskAlerts() {
    return prisma.walletRiskCheck.findMany({
      where: { status: { in: ['REVIEW_REQUIRED', 'BLOCKED'] } },
      select: { id: true, userId: true, chain: true, level: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN_LIMIT,
    });
  },

  screeningHits() {
    return prisma.screeningCheck.findMany({
      where: {
        status: 'POSSIBLE_MATCH',
        decision: { notIn: ['APPROVED', 'FALSE_POSITIVE'] },
      },
      select: { id: true, userId: true, category: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN_LIMIT,
    });
  },
};

export type AdminNotificationRepository = typeof adminNotificationRepository;
export type { Prisma };
