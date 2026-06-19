import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/** Filters for the AdminLog audit viewer. */
export interface AuditFilter {
  adminId?: string;
  action?: string;
  targetId?: string;
  fromDate?: Date;
  toDate?: Date;
}

type AdminLogWithActor = Prisma.AdminLogGetPayload<{
  include: { admin: { select: { email: true } } };
}>;

function buildAuditWhere(input: AuditFilter): Prisma.AdminLogWhereInput {
  const occurredAt: Prisma.DateTimeFilter = {};
  if (input.fromDate) occurredAt.gte = input.fromDate;
  if (input.toDate) occurredAt.lte = input.toDate;
  return {
    ...(input.adminId ? { adminId: input.adminId } : {}),
    ...(input.action ? { action: { contains: input.action } } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(Object.keys(occurredAt).length ? { occurredAt } : {}),
  };
}

export const operationsRepository = {
  countUsersByKycPending(): Promise<number> {
    return prisma.user.count({
      where: { kycStatus: { in: ['PENDING', 'IN_REVIEW', 'MANUAL_REVIEW'] } },
    });
  },

  countAdminsByStatus(status: string): Promise<number> {
    return prisma.admin.count({ where: { status } });
  },

  recentAdminActions(limit = 10): Promise<AdminLogWithActor[]> {
    return prisma.adminLog.findMany({
      orderBy: { id: 'desc' },
      take: limit,
      include: { admin: { select: { email: true } } },
    });
  },

  listAuditLogs(
    input: AuditFilter & { cursor?: string; limit: number },
  ): Promise<AdminLogWithActor[]> {
    return prisma.adminLog.findMany({
      where: {
        ...buildAuditWhere(input),
        ...(input.cursor ? { id: { lt: BigInt(input.cursor) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
      include: { admin: { select: { email: true } } },
    });
  },

  exportAuditLogs(input: AuditFilter, cap = 5000): Promise<AdminLogWithActor[]> {
    return prisma.adminLog.findMany({
      where: buildAuditWhere(input),
      orderBy: { id: 'desc' },
      take: cap,
      include: { admin: { select: { email: true } } },
    });
  },
};

export type OperationsRepository = typeof operationsRepository;
export type { AdminLogWithActor };
