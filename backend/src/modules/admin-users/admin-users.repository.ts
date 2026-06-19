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
