import {
  Prisma,
  type ComplianceAlert,
  type ComplianceCase,
  type ComplianceCaseEvent,
  type ComplianceCaseNote,
  type ComplianceCaseStatus,
  type ComplianceCasePriority,
  type ComplianceCaseType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { TradeActivity, TransferActivity } from './monitoring.rules';

/**
 * Repository for the compliance monitoring layer (Stage 5.2).
 *
 * READ side: it queries deposits / withdrawals / trades / inr_transactions and
 * the compliance profile to build a normalized activity snapshot. It NEVER
 * writes to those money-movement tables.
 *
 * WRITE side: it owns the four new tables (compliance_alerts, compliance_cases,
 * compliance_case_notes, compliance_case_events) exclusively, and never deletes
 * a record. Alerts/cases are created idempotently via unique `dedupeKey`s.
 */

const dec = (d: Prisma.Decimal | number | null): number =>
  d == null ? 0 : Number(d.toString());

/** Crypto withdrawal status -> normalized outcome. */
function withdrawalOutcome(status: string): TransferActivity['outcome'] {
  if (status === 'FAILED' || status === 'REJECTED') return 'FAILED';
  if (status === 'COMPLETED') return 'SUCCESS';
  return 'PENDING';
}

/** Crypto deposit status -> normalized outcome. */
function depositOutcome(status: string): TransferActivity['outcome'] {
  if (status === 'ORPHANED') return 'FAILED';
  if (status === 'CREDITED') return 'SUCCESS';
  return 'PENDING';
}

/** INR txn status -> normalized outcome. */
function inrOutcome(status: string): TransferActivity['outcome'] {
  if (status === 'FAILED' || status === 'REVERSED') return 'FAILED';
  if (status === 'SUCCESS') return 'SUCCESS';
  return 'PENDING';
}

export interface ActivitySnapshotData {
  withdrawals: TransferActivity[];
  deposits: TransferActivity[];
  trades: TradeActivity[];
}

export type ComplianceCaseWithRelations = ComplianceCase & {
  alerts: ComplianceAlert[];
  notes: ComplianceCaseNote[];
  events: ComplianceCaseEvent[];
  user: { email: string };
};

export const monitoringRepository = {
  /* ---------------- READ: money-movement tables (read-only) ------------- */

  /**
   * Build the normalized activity snapshot for one user within the lookback
   * window. Reads only; converts Decimal money to plain numbers for the rules.
   */
  async loadActivity(userId: string, since: Date): Promise<ActivitySnapshotData> {
    const [cw, cd, inr, trades] = await Promise.all([
      prisma.cryptoWithdrawal.findMany({
        where: { userId, requestedAt: { gte: since } },
        select: { id: true, asset: true, amount: true, status: true, requestedAt: true },
        orderBy: { requestedAt: 'desc' },
        take: 500,
      }),
      prisma.cryptoDeposit.findMany({
        where: { userId, detectedAt: { gte: since } },
        select: { id: true, asset: true, amount: true, status: true, detectedAt: true, creditedAt: true },
        orderBy: { detectedAt: 'desc' },
        take: 500,
      }),
      prisma.inrTransaction.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { id: true, type: true, amount: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.trade.findMany({
        where: {
          OR: [{ makerUserId: userId }, { takerUserId: userId }],
          executedAt: { gte: since },
        },
        select: { quoteAmount: true, executedAt: true },
        orderBy: { executedAt: 'desc' },
        take: 1000,
      }),
    ]);

    const withdrawals: TransferActivity[] = [
      ...cw.map((w) => ({
        id: w.id,
        kind: 'CRYPTO' as const,
        asset: w.asset,
        amount: dec(w.amount),
        outcome: withdrawalOutcome(w.status),
        status: w.status,
        at: w.requestedAt,
      })),
      ...inr
        .filter((t) => t.type === 'WITHDRAWAL')
        .map((t) => ({
          id: t.id,
          kind: 'INR' as const,
          asset: 'INR',
          amount: dec(t.amount),
          outcome: inrOutcome(t.status),
          status: t.status,
          at: t.createdAt,
        })),
    ];

    const deposits: TransferActivity[] = [
      ...cd.map((d) => ({
        id: d.id,
        kind: 'CRYPTO' as const,
        asset: d.asset,
        amount: dec(d.amount),
        outcome: depositOutcome(d.status),
        status: d.status,
        at: d.creditedAt ?? d.detectedAt,
      })),
      ...inr
        .filter((t) => t.type === 'DEPOSIT')
        .map((t) => ({
          id: t.id,
          kind: 'INR' as const,
          asset: 'INR',
          amount: dec(t.amount),
          outcome: inrOutcome(t.status),
          status: t.status,
          at: t.createdAt,
        })),
    ];

    const tradeActivity: TradeActivity[] = trades.map((t) => ({
      quoteAmount: dec(t.quoteAmount),
      at: t.executedAt,
    }));

    return { withdrawals, deposits, trades: tradeActivity };
  },

  /** The user's current risk grade + screening posture (read-only). */
  findProfileSignals(userId: string) {
    return prisma.complianceProfile.findUnique({
      where: { userId },
      select: { riskLevel: true, sanctionsStatus: true, pepStatus: true, adverseMediaStatus: true },
    });
  },

  /**
   * Distinct user ids with any money movement or trade in the window — the
   * candidate set for a full monitoring sweep (run with no specific user).
   */
  async usersWithRecentActivity(since: Date, limit = 500): Promise<string[]> {
    const [cw, cd, inr, tradesMaker, tradesTaker] = await Promise.all([
      prisma.cryptoWithdrawal.findMany({ where: { requestedAt: { gte: since } }, select: { userId: true }, take: limit }),
      prisma.cryptoDeposit.findMany({ where: { detectedAt: { gte: since }, userId: { not: null } }, select: { userId: true }, take: limit }),
      prisma.inrTransaction.findMany({ where: { createdAt: { gte: since } }, select: { userId: true }, take: limit }),
      prisma.trade.findMany({ where: { executedAt: { gte: since } }, select: { makerUserId: true }, take: limit }),
      prisma.trade.findMany({ where: { executedAt: { gte: since } }, select: { takerUserId: true }, take: limit }),
    ]);
    const set = new Set<string>();
    for (const r of cw) set.add(r.userId);
    for (const r of cd) if (r.userId) set.add(r.userId);
    for (const r of inr) set.add(r.userId);
    for (const r of tradesMaker) set.add(r.makerUserId);
    for (const r of tradesTaker) set.add(r.takerUserId);
    return [...set];
  },

  /* ---------------- WRITE: alerts (idempotent) -------------------------- */

  findAlert(id: string): Promise<ComplianceAlert | null> {
    return prisma.complianceAlert.findUnique({ where: { id } });
  },

  /**
   * Idempotently create an alert. Returns { alert, created }: on a duplicate
   * dedupeKey the existing alert is returned and `created` is false (so the
   * service never double-notifies or re-links).
   */
  async upsertAlert(data: Prisma.ComplianceAlertUncheckedCreateInput): Promise<{ alert: ComplianceAlert; created: boolean }> {
    const existing = await prisma.complianceAlert.findUnique({ where: { dedupeKey: data.dedupeKey } });
    if (existing) return { alert: existing, created: false };
    const alert = await prisma.complianceAlert.create({ data });
    return { alert, created: true };
  },

  updateAlert(id: string, data: Prisma.ComplianceAlertUncheckedUpdateInput): Promise<ComplianceAlert> {
    return prisma.complianceAlert.update({ where: { id }, data });
  },

  listAlerts(where: Prisma.ComplianceAlertWhereInput, take = 100): Promise<ComplianceAlert[]> {
    return prisma.complianceAlert.findMany({ where, orderBy: { createdAt: 'desc' }, take });
  },

  /* ---------------- WRITE: cases --------------------------------------- */

  findCaseByDedupe(dedupeKey: string): Promise<ComplianceCase | null> {
    return prisma.complianceCase.findUnique({ where: { dedupeKey } });
  },

  createCase(data: Prisma.ComplianceCaseUncheckedCreateInput): Promise<ComplianceCase> {
    return prisma.complianceCase.create({ data });
  },

  updateCase(id: string, data: Prisma.ComplianceCaseUncheckedUpdateInput): Promise<ComplianceCase> {
    return prisma.complianceCase.update({ where: { id }, data });
  },

  findCase(id: string): Promise<ComplianceCaseWithRelations | null> {
    return prisma.complianceCase.findUnique({
      where: { id },
      include: {
        alerts: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' } },
        user: { select: { email: true } },
      },
    }) as Promise<ComplianceCaseWithRelations | null>;
  },

  async listCases(input: {
    status?: ComplianceCaseStatus;
    priority?: ComplianceCasePriority;
    type?: ComplianceCaseType;
    assignedToAdminId?: string;
    cursor?: string;
    limit: number;
  }): Promise<(ComplianceCase & { user: { email: string }; _count: { alerts: number } })[]> {
    return prisma.complianceCase.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.assignedToAdminId ? { assignedToAdminId: input.assignedToAdminId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      include: { user: { select: { email: true } }, _count: { select: { alerts: true } } },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    }) as Promise<(ComplianceCase & { user: { email: string }; _count: { alerts: number } })[]>;
  },

  /** Count cases that should currently contribute to risk (open + HIGH/CRITICAL). */
  countOpenHighRiskCases(userId: string): Promise<number> {
    return prisma.complianceCase.count({
      where: {
        userId,
        priority: { in: ['HIGH', 'CRITICAL'] },
        status: { notIn: ['CLOSED'] },
      },
    });
  },

  /* ---------------- WRITE: notes + events ------------------------------ */

  createNote(data: Prisma.ComplianceCaseNoteUncheckedCreateInput): Promise<ComplianceCaseNote> {
    return prisma.complianceCaseNote.create({ data });
  },

  createEvent(data: Prisma.ComplianceCaseEventUncheckedCreateInput): Promise<ComplianceCaseEvent> {
    return prisma.complianceCaseEvent.create({ data });
  },

  /* ---------------- dashboard summary ---------------------------------- */

  async summary(): Promise<{
    openCases: number;
    highCriticalCases: number;
    openAlerts: number;
    strDrafted: number;
  }> {
    const [openCases, highCriticalCases, openAlerts, strDrafted] = await Promise.all([
      prisma.complianceCase.count({ where: { status: { notIn: ['CLOSED'] } } }),
      prisma.complianceCase.count({ where: { status: { notIn: ['CLOSED'] }, priority: { in: ['HIGH', 'CRITICAL'] } } }),
      prisma.complianceAlert.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      prisma.complianceCase.count({ where: { status: 'STR_DRAFTED' } }),
    ]);
    return { openCases, highCriticalCases, openAlerts, strDrafted };
  },
};

export type MonitoringRepository = typeof monitoringRepository;
