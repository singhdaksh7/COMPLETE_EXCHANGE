import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  HIGH_RISK_PREFIXES,
  MEDIUM_RISK_PREFIXES,
  type AuditRiskLevel,
} from './audit-review.risk';

/**
 * Stage 9D — Admin Audit Review repository.
 *
 * READ-ONLY over the append-only AdminLog (the admin accountability trail). It
 * NEVER writes. Keyset pagination on the BigInt id (newest-first) keeps deep
 * pages cheap and stable. Risk filtering is translated into action-prefix
 * predicates so it can run at the DB and stay consistent with the display
 * classification (audit-review.risk).
 *
 * Distinct from the existing /operations/audit viewer — this is an additive
 * second view with risk-aware filtering. It does not modify that route.
 */
export interface AuditReviewFilter {
  adminId?: string;
  targetId?: string;
  action?: string;
  riskLevel?: AuditRiskLevel;
  ip?: string;
  fromDate?: Date;
  toDate?: Date;
}

export type AdminLogWithActor = Prisma.AdminLogGetPayload<{
  include: { admin: { select: { email: true } } };
}>;

/** OR of `action startsWith <prefix>` for a set of prefixes. */
function startsWithAny(prefixes: readonly string[]): Prisma.AdminLogWhereInput {
  return { OR: prefixes.map((p) => ({ action: { startsWith: p } })) };
}

/** Translate a derived risk bucket into an AdminLog WHERE fragment. */
function riskWhere(risk: AuditRiskLevel): Prisma.AdminLogWhereInput {
  if (risk === 'HIGH') return startsWithAny(HIGH_RISK_PREFIXES);
  if (risk === 'MEDIUM') return startsWithAny(MEDIUM_RISK_PREFIXES);
  // LOW = neither HIGH nor MEDIUM.
  return {
    NOT: {
      OR: [...HIGH_RISK_PREFIXES, ...MEDIUM_RISK_PREFIXES].map((p) => ({
        action: { startsWith: p },
      })),
    },
  };
}

function buildWhere(input: AuditReviewFilter): Prisma.AdminLogWhereInput {
  const occurredAt: Prisma.DateTimeFilter = {};
  if (input.fromDate) occurredAt.gte = input.fromDate;
  if (input.toDate) occurredAt.lte = input.toDate;

  const where: Prisma.AdminLogWhereInput = {
    ...(input.adminId ? { adminId: input.adminId } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.action ? { action: { contains: input.action } } : {}),
    ...(input.ip ? { ip: { equals: input.ip } } : {}),
    ...(Object.keys(occurredAt).length ? { occurredAt } : {}),
  };

  if (input.riskLevel) {
    // Combine the risk predicate with the other filters via AND.
    return { AND: [where, riskWhere(input.riskLevel)] };
  }
  return where;
}

export const auditReviewRepository = {
  list(
    input: AuditReviewFilter & { cursor?: string; limit: number },
  ): Promise<AdminLogWithActor[]> {
    return prisma.adminLog.findMany({
      where: {
        AND: [
          buildWhere(input),
          ...(input.cursor ? [{ id: { lt: BigInt(input.cursor) } }] : []),
        ],
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
      include: { admin: { select: { email: true } } },
    });
  },

  /** Count rows matching the filter (without pagination), capped by caller. */
  count(input: AuditReviewFilter): Promise<number> {
    return prisma.adminLog.count({ where: buildWhere(input) });
  },
};

export type AuditReviewRepository = typeof auditReviewRepository;
