import {
  type AdminLog,
  type AuditLog,
  type ComplianceCase,
  type ComplianceNote,
  type CryptoDeposit,
  type CryptoWithdrawal,
  type InrTransaction,
  type Order,
  type Trade,
  type User,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Read-only fetchers for the Stage 8D unified user timeline.
 *
 * Each source returns up to `limit + 1` rows strictly OLDER than the time cursor
 * (keyset pagination on the row's own timestamp). The service normalises every
 * source into a common TimelineEvent, merges, sorts by time desc and takes the
 * page — so the merged page is globally correct for that window. All data is
 * real; nothing is synthesised. Compliance sources are only queried when the
 * caller is allowed to see them.
 */

function before(cursor: Date | undefined) {
  return cursor ? { lt: cursor } : undefined;
}

export type TimelineHeader = Pick<
  User,
  'id' | 'createdAt' | 'emailVerifiedAt' | 'phoneVerifiedAt'
>;

export const userTimelineRepository = {
  header(userId: string): Promise<TimelineHeader | null> {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, createdAt: true, emailVerifiedAt: true, phoneVerifiedAt: true },
    });
  },

  adminLogs(userId: string, cursor: Date | undefined, limit: number): Promise<AdminLog[]> {
    return prisma.adminLog.findMany({
      where: { targetId: userId, ...(cursor ? { occurredAt: { lt: cursor } } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
    });
  },

  auditLogs(userId: string, cursor: Date | undefined, limit: number): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { actorId: userId, ...(cursor ? { occurredAt: { lt: cursor } } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
    });
  },

  inrTransactions(userId: string, cursor: Date | undefined, limit: number): Promise<InrTransaction[]> {
    return prisma.inrTransaction.findMany({
      where: { userId, ...(before(cursor) ? { createdAt: before(cursor) } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
  },

  cryptoDeposits(userId: string, cursor: Date | undefined, limit: number): Promise<CryptoDeposit[]> {
    return prisma.cryptoDeposit.findMany({
      where: { userId, ...(before(cursor) ? { detectedAt: before(cursor) } : {}) },
      orderBy: { detectedAt: 'desc' },
      take: limit + 1,
    });
  },

  cryptoWithdrawals(userId: string, cursor: Date | undefined, limit: number): Promise<CryptoWithdrawal[]> {
    return prisma.cryptoWithdrawal.findMany({
      where: { userId, ...(before(cursor) ? { requestedAt: before(cursor) } : {}) },
      orderBy: { requestedAt: 'desc' },
      take: limit + 1,
    });
  },

  orders(userId: string, cursor: Date | undefined, limit: number): Promise<Array<Order & { market: { symbol: string } }>> {
    return prisma.order.findMany({
      where: { userId, ...(before(cursor) ? { createdAt: before(cursor) } : {}) },
      include: { market: { select: { symbol: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    }) as Promise<Array<Order & { market: { symbol: string } }>>;
  },

  trades(userId: string, cursor: Date | undefined, limit: number): Promise<Array<Trade & { market: { symbol: string } }>> {
    return prisma.trade.findMany({
      where: {
        OR: [{ makerUserId: userId }, { takerUserId: userId }],
        ...(before(cursor) ? { executedAt: before(cursor) } : {}),
      },
      include: { market: { select: { symbol: true } } },
      orderBy: { executedAt: 'desc' },
      take: limit + 1,
    }) as Promise<Array<Trade & { market: { symbol: string } }>>;
  },

  // ---- compliance sources (gated by compliance.view in the service) ----
  complianceCases(userId: string, cursor: Date | undefined, limit: number): Promise<ComplianceCase[]> {
    return prisma.complianceCase.findMany({
      where: { userId, ...(before(cursor) ? { createdAt: before(cursor) } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
  },

  complianceNotes(userId: string, cursor: Date | undefined, limit: number): Promise<ComplianceNote[]> {
    return prisma.complianceNote.findMany({
      where: { userId, ...(before(cursor) ? { createdAt: before(cursor) } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
  },
};

export type UserTimelineRepository = typeof userTimelineRepository;
