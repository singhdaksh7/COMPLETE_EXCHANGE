import { Prisma, type CryptoWithdrawal, type InrTransaction, type Order, type Trade, type User } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import {
  adminUsersRepository,
  type AdminUserDetailRow,
  type AdminUserListRow,
} from './admin-users.repository';
import type { AccountStatusDto, AdminUserListQueryDto, RiskProfileDto } from './admin-users.validators';

export interface AdminUserContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

interface BalanceSummaryItem {
  asset: string;
  available: string;
  locked: string;
  total: string;
}

export interface AdminUserListItemDto {
  id: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  kycStatus: string;
  kycTier: number;
  accountStatus: string;
  withdrawalsBlocked: boolean;
  riskLevel: string;
  riskNote: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  balances: BalanceSummaryItem[];
}

export interface AdminUserDetailDto extends AdminUserListItemDto {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  totpEnabled: boolean;
  updatedAt: Date;
  kycProfile: {
    fullName: string | null;
    status: string;
    provider: string | null;
    providerRef: string | null;
    panMasked: string | null;
    aadhaarMasked: string | null;
    livenessStatus: string | null;
    documentStatus: string | null;
    riskScore: number | null;
    rejectedReason: string | null;
    reviewedAt: Date | null;
  } | null;
  sessions: Array<{
    id: string;
    ip: string | null;
    deviceInfo: unknown;
    createdAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  }>;
  inrTransactions: Array<ReturnType<typeof toInrTxnDto>>;
  withdrawals: Array<ReturnType<typeof toWithdrawalDto>>;
  orders: Array<ReturnType<typeof toOrderSummaryDto>>;
  trades: Array<ReturnType<typeof toTradeSummaryDto>>;
  adminLogs: Array<{
    id: string;
    action: string;
    reason: string | null;
    beforeState: unknown;
    afterState: unknown;
    occurredAt: Date;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    metadata: unknown;
    occurredAt: Date;
  }>;
}

function balanceSummary(accounts: AdminUserListRow['accounts']): BalanceSummaryItem[] {
  const byAsset = new Map<string, { available: Prisma.Decimal; locked: Prisma.Decimal }>();
  for (const account of accounts) {
    const key = account.asset.toUpperCase();
    const current = byAsset.get(key) ?? {
      available: new Prisma.Decimal(0),
      locked: new Prisma.Decimal(0),
    };
    const balance = account.balance?.balance ?? new Prisma.Decimal(0);
    if (account.kind === 'USER_AVAILABLE') current.available = current.available.add(balance);
    if (account.kind === 'USER_LOCKED') current.locked = current.locked.add(balance);
    byAsset.set(key, current);
  }
  return [...byAsset.entries()].map(([asset, v]) => ({
    asset,
    available: v.available.toFixed(),
    locked: v.locked.toFixed(),
    total: v.available.add(v.locked).toFixed(),
  }));
}

function toListItem(row: AdminUserListRow): AdminUserListItemDto {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerifiedAt !== null,
    emailVerifiedAt: row.emailVerifiedAt,
    kycStatus: row.kycStatus,
    kycTier: row.kycTier,
    accountStatus: row.status,
    withdrawalsBlocked: row.withdrawalsBlocked,
    riskLevel: row.riskLevel,
    riskNote: row.riskNote,
    createdAt: row.createdAt,
    lastLoginAt: row.sessions[0]?.createdAt ?? null,
    balances: balanceSummary(row.accounts),
  };
}

function toInrTxnDto(row: InrTransaction) {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount.toFixed(),
    fee: row.fee.toFixed(),
    status: row.status,
    provider: row.provider,
    utr: row.utr,
    method: row.method,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
  };
}

function toWithdrawalDto(row: CryptoWithdrawal) {
  return {
    id: row.id,
    chain: row.chain,
    asset: row.asset,
    toAddress: row.toAddress,
    amount: row.amount.toFixed(),
    fee: row.fee.toFixed(),
    netAmount: row.netAmount.toFixed(),
    status: row.status,
    txHash: row.txHash,
    failureReason: row.failureReason,
    requestedAt: row.requestedAt,
    completedAt: row.completedAt,
  };
}

function toOrderSummaryDto(row: Order & { market: { symbol: string } }) {
  return {
    id: row.id,
    marketSymbol: row.market.symbol,
    side: row.side,
    type: row.type,
    price: row.price?.toFixed() ?? null,
    quantity: row.quantity?.toFixed() ?? null,
    quoteBudget: row.quoteBudget?.toFixed() ?? null,
    filledQuantity: row.filledQuantity.toFixed(),
    quoteSpent: row.quoteSpent.toFixed(),
    status: row.status,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
  };
}

function toTradeSummaryDto(row: Trade & { market: { symbol: string } }) {
  return {
    id: row.id,
    marketSymbol: row.market.symbol,
    price: row.price.toFixed(),
    quantity: row.quantity.toFixed(),
    quoteAmount: row.quoteAmount.toFixed(),
    makerSide: row.makerSide,
    role: row.makerUserId === row.takerUserId ? 'SELF' : undefined,
    seq: row.seq.toString(),
    executedAt: row.executedAt,
  };
}

function toDetail(row: AdminUserDetailRow, extra: {
  inrTransactions: InrTransaction[];
  withdrawals: CryptoWithdrawal[];
  orders: Array<Order & { market: { symbol: string } }>;
  trades: Array<Trade & { market: { symbol: string } }>;
  adminLogs: Awaited<ReturnType<typeof adminUsersRepository.recentAdminLogs>>;
  auditLogs: Awaited<ReturnType<typeof adminUsersRepository.recentAuditLogs>>;
}): AdminUserDetailDto {
  return {
    ...toListItem(row),
    phone: row.phone,
    phoneVerifiedAt: row.phoneVerifiedAt,
    totpEnabled: row.totpEnabled,
    updatedAt: row.updatedAt,
    kycProfile: row.kycProfile
      ? {
          fullName: row.kycProfile.fullName,
          status: row.kycProfile.status,
          provider: row.kycProfile.provider,
          providerRef: row.kycProfile.providerRef,
          panMasked: row.kycProfile.panMasked,
          aadhaarMasked: row.kycProfile.aadhaarMasked,
          livenessStatus: row.kycProfile.livenessStatus,
          documentStatus: row.kycProfile.documentStatus,
          riskScore: row.kycProfile.riskScore,
          rejectedReason: row.kycProfile.rejectedReason,
          reviewedAt: row.kycProfile.reviewedAt,
        }
      : null,
    sessions: row.sessions,
    inrTransactions: extra.inrTransactions.map(toInrTxnDto),
    withdrawals: extra.withdrawals.map(toWithdrawalDto),
    orders: extra.orders.map(toOrderSummaryDto),
    trades: extra.trades.map(toTradeSummaryDto),
    adminLogs: extra.adminLogs.map((l) => ({
      id: l.id.toString(),
      action: l.action,
      reason: l.reason,
      beforeState: l.beforeState,
      afterState: l.afterState,
      occurredAt: l.occurredAt,
    })),
    auditLogs: extra.auditLogs.map((l) => ({
      id: l.id.toString(),
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      metadata: l.metadata,
      occurredAt: l.occurredAt,
    })),
  };
}

function dateOrUndefined(value?: string): Date | undefined {
  return value ? new Date(value) : undefined;
}

function userState(user: User): Prisma.InputJsonObject {
  return {
    status: user.status,
    withdrawalsBlocked: user.withdrawalsBlocked,
    riskLevel: user.riskLevel,
    riskNote: user.riskNote,
  };
}

export const adminUsersService = {
  async listUsers(input: AdminUserListQueryDto, ctx: AdminUserContext = {}) {
    const rows = await adminUsersRepository.listUsers({
      email: input.email,
      kycStatus: input.kycStatus,
      accountStatus: input.accountStatus,
      riskLevel: input.riskLevel,
      createdFrom: dateOrUndefined(input.createdFrom),
      createdTo: dateOrUndefined(input.createdTo),
      cursor: input.cursor,
      limit: input.limit,
    });
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    await this.auditAdmin(ctx, {
      action: 'admin.users.list',
      targetType: 'user',
      afterState: { count: slice.length },
    });
    return {
      items: slice.map(toListItem),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async getUser(userId: string, ctx: AdminUserContext = {}): Promise<AdminUserDetailDto> {
    const [user, inrTransactions, withdrawals, orders, trades, adminLogs, auditLogs] =
      await Promise.all([
        adminUsersRepository.findUserDetail(userId),
        adminUsersRepository.recentInrTransactions(userId),
        adminUsersRepository.recentWithdrawals(userId),
        adminUsersRepository.recentOrders(userId),
        adminUsersRepository.recentTrades(userId),
        adminUsersRepository.recentAdminLogs(userId),
        adminUsersRepository.recentAuditLogs(userId),
      ]);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    await this.auditAdmin(ctx, {
      action: 'admin.users.detail',
      targetType: 'user',
      targetId: userId,
    });
    return toDetail(user, {
      inrTransactions,
      withdrawals,
      orders,
      trades,
      adminLogs,
      auditLogs,
    });
  },

  async setAccountStatus(
    userId: string,
    input: AccountStatusDto,
    ctx: AdminUserContext,
  ): Promise<AdminUserListItemDto> {
    const existing = await adminUsersRepository.findUserForUpdate(userId);
    if (!existing) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    if (existing.status === 'CLOSED' || existing.status === 'LOCKED') {
      throw new ForbiddenError('Only ACTIVE and FROZEN users can be changed here', 'ACCOUNT_STATUS_LOCKED');
    }
    const updated = await adminUsersRepository.updateUser(userId, { status: input.status });
    await this.auditAdmin(ctx, {
      action: input.status === 'FROZEN' ? 'admin.user.freeze' : 'admin.user.unfreeze',
      targetType: 'user',
      targetId: userId,
      beforeState: userState(existing),
      afterState: userState(updated),
    });
    const detail = await adminUsersRepository.findUserDetail(userId);
    return toListItem(detail as AdminUserDetailRow);
  },

  async setWithdrawalBlock(
    userId: string,
    withdrawalsBlocked: boolean,
    ctx: AdminUserContext,
  ): Promise<AdminUserListItemDto> {
    const existing = await adminUsersRepository.findUserForUpdate(userId);
    if (!existing) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    const updated = await adminUsersRepository.updateUser(userId, {
      withdrawalsBlocked,
    });
    await this.auditAdmin(ctx, {
      action: withdrawalsBlocked
        ? 'admin.user.withdrawals_block'
        : 'admin.user.withdrawals_unblock',
      targetType: 'user',
      targetId: userId,
      beforeState: userState(existing),
      afterState: userState(updated),
    });
    const detail = await adminUsersRepository.findUserDetail(userId);
    return toListItem(detail as AdminUserDetailRow);
  },

  async updateRiskProfile(
    userId: string,
    input: RiskProfileDto,
    ctx: AdminUserContext,
  ): Promise<AdminUserListItemDto> {
    const existing = await adminUsersRepository.findUserForUpdate(userId);
    if (!existing) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    const updated = await adminUsersRepository.updateUser(userId, {
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.riskNote !== undefined ? { riskNote: input.riskNote || null } : {}),
    });
    await this.auditAdmin(ctx, {
      action: 'admin.user.risk_update',
      targetType: 'user',
      targetId: userId,
      beforeState: userState(existing),
      afterState: userState(updated),
    });
    const detail = await adminUsersRepository.findUserDetail(userId);
    return toListItem(detail as AdminUserDetailRow);
  },

  async auditAdmin(
    ctx: AdminUserContext,
    input: {
      action: string;
      targetType?: string;
      targetId?: string;
      beforeState?: Prisma.InputJsonValue;
      afterState?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: input.action,
      entityType: input.targetType,
      entityId: input.targetId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: input.afterState,
    });
    if (ctx.actorId) {
      await adminUsersRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        beforeState: input.beforeState,
        afterState: input.afterState,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
  },
};

export type AdminUsersService = typeof adminUsersService;
