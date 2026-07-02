import {
  Prisma,
  type AdminLog,
  type AuditLog,
  type CryptoWithdrawal,
  type InrTransaction,
  type KycProfile,
  type Order,
  type Trade,
  type User,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type AdminUserListRow = User & {
  accounts: Array<{
    asset: string;
    kind: string;
    balance: { balance: Prisma.Decimal } | null;
  }>;
  sessions: Array<{ createdAt: Date }>;
};

export type AdminUserDetailRow = User & {
  kycProfile: KycProfile | null;
  accounts: Array<{
    asset: string;
    kind: string;
    balance: { balance: Prisma.Decimal } | null;
  }>;
  sessions: Array<{ id: string; ip: string | null; deviceInfo: Prisma.JsonValue; createdAt: Date; expiresAt: Date; revokedAt: Date | null }>;
};

/** Archived (soft-deleted) user list row — same shape as the active list plus
 *  the KYC full name (for display) and the archive audit anchors (User fields). */
export type AdminArchivedUserRow = AdminUserListRow & {
  kycProfile: { fullName: string | null } | null;
};

/**
 * The open obligations that BLOCK archiving a user. Every field is derived from
 * live operational state; a user is only archivable when all of these are clear
 * so no funds, in-flight money movement, open orders, or unresolved
 * compliance/support obligations are ever orphaned by the soft delete.
 */
export interface UserArchiveObligations {
  nonZeroBalances: Array<{ asset: string; kind: string; balance: string }>;
  pendingInrDeposits: number;
  pendingInrWithdrawals: number;
  openOrders: number;
  openComplianceCases: number;
  underComplianceReview: boolean;
  openSupportTickets: number;
}

export const adminUsersRepository = {
  listUsers(input: {
    email?: string;
    kycStatus?: User['kycStatus'];
    accountStatus?: User['status'];
    riskLevel?: User['riskLevel'];
    createdFrom?: Date;
    createdTo?: Date;
    cursor?: string;
    limit: number;
  }): Promise<AdminUserListRow[]> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(input.email ? { email: { contains: input.email, mode: 'insensitive' } } : {}),
      ...(input.kycStatus ? { kycStatus: input.kycStatus } : {}),
      ...(input.accountStatus ? { status: input.accountStatus } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
    };
    if (input.createdFrom || input.createdTo) {
      where.createdAt = {
        ...(input.createdFrom ? { gte: input.createdFrom } : {}),
        ...(input.createdTo ? { lte: input.createdTo } : {}),
      };
    }
    return prisma.user.findMany({
      where,
      include: {
        accounts: {
          where: { kind: { in: ['USER_AVAILABLE', 'USER_LOCKED'] } },
          select: { asset: true, kind: true, balance: { select: { balance: true } } },
        },
        sessions: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
  },

  findUserDetail(userId: string): Promise<AdminUserDetailRow | null> {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        kycProfile: true,
        accounts: {
          where: { kind: { in: ['USER_AVAILABLE', 'USER_LOCKED'] } },
          select: { asset: true, kind: true, balance: { select: { balance: true } } },
          orderBy: [{ asset: 'asc' }, { kind: 'asc' }],
        },
        sessions: {
          select: {
            id: true,
            ip: true,
            deviceInfo: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  },

  recentInrTransactions(userId: string): Promise<InrTransaction[]> {
    return prisma.inrTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  },

  recentWithdrawals(userId: string): Promise<CryptoWithdrawal[]> {
    return prisma.cryptoWithdrawal.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 10,
    });
  },

  recentOrders(userId: string): Promise<Array<Order & { market: { symbol: string } }>> {
    return prisma.order.findMany({
      where: { userId },
      include: { market: { select: { symbol: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  },

  recentTrades(userId: string): Promise<Array<Trade & { market: { symbol: string } }>> {
    return prisma.trade.findMany({
      where: { OR: [{ makerUserId: userId }, { takerUserId: userId }] },
      include: { market: { select: { symbol: true } } },
      orderBy: { seq: 'desc' },
      take: 10,
    });
  },

  recentAdminLogs(userId: string): Promise<AdminLog[]> {
    return prisma.adminLog.findMany({
      where: { targetType: 'user', targetId: userId },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });
  },

  recentAuditLogs(userId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });
  },

  findUserForUpdate(userId: string) {
    return prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  },

  updateUser(userId: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id: userId }, data });
  },

  // --- Soft delete / archive (Stage 9C) ------------------------------------

  /** List archived (soft-deleted) users only. Mirrors listUsers filters but
   *  scoped to deletedAt IS NOT NULL and ordered by most-recently archived. */
  listArchivedUsers(input: {
    email?: string;
    kycStatus?: User['kycStatus'];
    accountStatus?: User['status'];
    riskLevel?: User['riskLevel'];
    createdFrom?: Date;
    createdTo?: Date;
    cursor?: string;
    limit: number;
  }): Promise<AdminArchivedUserRow[]> {
    const where: Prisma.UserWhereInput = {
      deletedAt: { not: null },
      ...(input.email ? { email: { contains: input.email, mode: 'insensitive' } } : {}),
      ...(input.kycStatus ? { kycStatus: input.kycStatus } : {}),
      ...(input.accountStatus ? { status: input.accountStatus } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
    };
    if (input.createdFrom || input.createdTo) {
      where.deletedAt = {
        not: null,
        ...(input.createdFrom ? { gte: input.createdFrom } : {}),
        ...(input.createdTo ? { lte: input.createdTo } : {}),
      };
    }
    return prisma.user.findMany({
      where,
      include: {
        kycProfile: { select: { fullName: true } },
        accounts: {
          where: { kind: { in: ['USER_AVAILABLE', 'USER_LOCKED'] } },
          select: { asset: true, kind: true, balance: { select: { balance: true } } },
        },
        sessions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
  },

  /** Full detail for an archived user (read-only view in the Deleted tab). */
  findArchivedUserDetail(userId: string): Promise<AdminUserDetailRow | null> {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: { not: null } },
      include: {
        kycProfile: true,
        accounts: {
          where: { kind: { in: ['USER_AVAILABLE', 'USER_LOCKED'] } },
          select: { asset: true, kind: true, balance: { select: { balance: true } } },
          orderBy: [{ asset: 'asc' }, { kind: 'asc' }],
        },
        sessions: {
          select: { id: true, ip: true, deviceInfo: true, createdAt: true, expiresAt: true, revokedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  },

  /** Load an active (non-archived) user for the archive flow. */
  findActiveUser(userId: string) {
    return prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  },

  /** Load an archived user row (for restore). */
  findArchivedUser(userId: string) {
    return prisma.user.findFirst({ where: { id: userId, deletedAt: { not: null } } });
  },

  /**
   * Compute the open obligations that block archiving. Read-only; never mutates.
   */
  async userArchiveObligations(userId: string): Promise<UserArchiveObligations> {
    const [
      balances,
      pendingInrDeposits,
      pendingInrWithdrawals,
      openOrders,
      openComplianceCases,
      featureControls,
      openSupportTickets,
    ] = await Promise.all([
      prisma.accountBalance.findMany({
        where: {
          balance: { gt: 0 },
          account: { userId, kind: { in: ['USER_AVAILABLE', 'USER_LOCKED'] } },
        },
        select: { balance: true, account: { select: { asset: true, kind: true } } },
      }),
      prisma.inrTransaction.count({
        where: { userId, type: 'DEPOSIT', status: { in: ['INITIATED', 'PENDING'] } },
      }),
      prisma.inrWithdrawal.count({
        where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
      }),
      prisma.order.count({
        where: { userId, status: { in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] } },
      }),
      prisma.complianceCase.count({ where: { userId, closedAt: null } }),
      prisma.userFeatureControls.findUnique({
        where: { userId },
        select: { underComplianceReview: true },
      }),
      prisma.supportTicket.count({
        where: { userId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
    ]);
    return {
      nonZeroBalances: balances.map((b) => ({
        asset: b.account.asset.toUpperCase(),
        kind: b.account.kind,
        balance: b.balance.toFixed(),
      })),
      pendingInrDeposits,
      pendingInrWithdrawals,
      openOrders,
      openComplianceCases,
      underComplianceReview: featureControls?.underComplianceReview ?? false,
      openSupportTickets,
    };
  },

  /** Soft-delete (archive) a user: set the archive anchors + CLOSED status.
   *  The row is never physically deleted. */
  archiveUser(
    userId: string,
    data: { deletedByAdminId?: string; reason: string },
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        deletedByAdminId: data.deletedByAdminId ?? null,
        deletionReason: data.reason,
        status: 'CLOSED',
      },
    });
  },

  /** Restore a previously archived user: clear the archive anchors + reactivate.
   *  Old sessions were revoked at archive time and are NOT restored. */
  restoreUser(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: null,
        deletedByAdminId: null,
        deletionReason: null,
        status: 'ACTIVE',
      },
    });
  },

  /** Resolve admin id -> email for the "archived by" display. */
  findAdminEmailsByIds(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return Promise.resolve(new Map());
    return prisma.admin
      .findMany({ where: { id: { in: unique } }, select: { id: true, email: true } })
      .then((rows) => new Map(rows.map((r) => [r.id, r.email])));
  },

  /** Revoke every live session for a user (used at archive time). */
  revokeAllUserSessions(userId: string) {
    return prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
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

export type AdminUsersRepository = typeof adminUsersRepository;
