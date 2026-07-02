import { Prisma, type CryptoWithdrawal, type InrTransaction, type Order, type Trade, type User } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { adminRbacService } from '../admin-rbac/admin-rbac.service';
import {
  adminUsersRepository,
  type AdminArchivedUserRow,
  type AdminUserDetailRow,
  type AdminUserListRow,
  type UserArchiveObligations,
} from './admin-users.repository';
import type { AccountStatusDto, AdminUserListQueryDto, RiskProfileDto } from './admin-users.validators';

/**
 * Admin-safe message returned when a user has open obligations (funds, pending
 * money movement, open orders, unresolved compliance/support). The exact copy
 * is stable so the admin UI can surface it verbatim.
 */
const ARCHIVE_BLOCKED_MESSAGE =
  'User cannot be archived while funds, pending transactions, or open obligations exist.';

const SUPER_ADMIN = 'SUPER_ADMIN';

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

/** Archive audit anchors added to the archived (Deleted Users tab) DTOs. */
interface ArchiveMetaDto {
  fullName: string | null;
  deletedAt: Date | null;
  deletedByAdminId: string | null;
  deletedByAdminEmail: string | null;
  deletionReason: string | null;
}

export interface AdminArchivedUserListItemDto extends AdminUserListItemDto, ArchiveMetaDto {}

export interface AdminArchivedUserDetailDto extends AdminUserDetailDto, ArchiveMetaDto {}

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

/** Machine-readable blocker codes for an attempted archive. Empty => archivable. */
function collectArchiveBlockers(o: UserArchiveObligations): string[] {
  const blockers: string[] = [];
  if (o.nonZeroBalances.length > 0) blockers.push('NON_ZERO_BALANCE');
  if (o.pendingInrDeposits > 0) blockers.push('PENDING_INR_DEPOSIT');
  if (o.pendingInrWithdrawals > 0) blockers.push('PENDING_INR_WITHDRAWAL');
  if (o.openOrders > 0) blockers.push('OPEN_ORDERS');
  if (o.openComplianceCases > 0 || o.underComplianceReview) {
    blockers.push('UNRESOLVED_COMPLIANCE_HOLD');
  }
  if (o.openSupportTickets > 0) blockers.push('OPEN_SUPPORT_CASE');
  return blockers;
}

function toArchivedListItem(
  row: AdminArchivedUserRow,
  emailMap: Map<string, string>,
): AdminArchivedUserListItemDto {
  return {
    ...toListItem(row),
    fullName: row.kycProfile?.fullName ?? null,
    deletedAt: row.deletedAt,
    deletedByAdminId: row.deletedByAdminId,
    deletedByAdminEmail: row.deletedByAdminId
      ? emailMap.get(row.deletedByAdminId) ?? null
      : null,
    deletionReason: row.deletionReason,
  };
}

/**
 * Defence-in-depth SUPER_ADMIN gate for the archive/restore actions. The route
 * permission (users.archive / users.viewArchived) is granted to NO non-super
 * role, so only SUPER_ADMIN reaches here; this re-check ensures the service is
 * safe even if a route is ever misconfigured.
 */
async function ensureSuperAdmin(ctx: AdminUserContext): Promise<void> {
  const roles = ctx.actorId
    ? (await adminRbacService.getAdminPermissions(ctx.actorId)).roles
    : [];
  if (!roles.includes(SUPER_ADMIN)) {
    throw new ForbiddenError('Only SUPER_ADMIN can perform this action', 'FORBIDDEN');
  }
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

  // --- Soft delete / archive (Stage 9C) — SUPER_ADMIN only ------------------

  /** List archived (soft-deleted) users. Read-only; never shows active users. */
  async listArchivedUsers(input: AdminUserListQueryDto, ctx: AdminUserContext = {}) {
    const rows = await adminUsersRepository.listArchivedUsers({
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
    const emailMap = await adminUsersRepository.findAdminEmailsByIds(
      slice.map((r) => r.deletedByAdminId).filter((x): x is string => Boolean(x)),
    );
    await this.auditAdmin(ctx, {
      action: 'admin.users.archived_list',
      targetType: 'user',
      afterState: { count: slice.length },
    });
    return {
      items: slice.map((r) => toArchivedListItem(r, emailMap)),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  /** Read-only detail of a single archived user. */
  async getArchivedUser(
    userId: string,
    ctx: AdminUserContext = {},
  ): Promise<AdminArchivedUserDetailDto> {
    const [user, inrTransactions, withdrawals, orders, trades, adminLogs, auditLogs] =
      await Promise.all([
        adminUsersRepository.findArchivedUserDetail(userId),
        adminUsersRepository.recentInrTransactions(userId),
        adminUsersRepository.recentWithdrawals(userId),
        adminUsersRepository.recentOrders(userId),
        adminUsersRepository.recentTrades(userId),
        adminUsersRepository.recentAdminLogs(userId),
        adminUsersRepository.recentAuditLogs(userId),
      ]);
    if (!user) throw new NotFoundError('Archived user not found', 'USER_NOT_FOUND');
    const emailMap = await adminUsersRepository.findAdminEmailsByIds(
      user.deletedByAdminId ? [user.deletedByAdminId] : [],
    );
    await this.auditAdmin(ctx, {
      action: 'admin.users.archived_detail',
      targetType: 'user',
      targetId: userId,
    });
    const detail = toDetail(user, {
      inrTransactions,
      withdrawals,
      orders,
      trades,
      adminLogs,
      auditLogs,
    });
    return {
      ...detail,
      fullName: user.kycProfile?.fullName ?? null,
      deletedAt: user.deletedAt,
      deletedByAdminId: user.deletedByAdminId,
      deletedByAdminEmail: user.deletedByAdminId
        ? emailMap.get(user.deletedByAdminId) ?? null
        : null,
      deletionReason: user.deletionReason,
    };
  },

  /**
   * Soft-delete (archive) a user. SUPER_ADMIN only. Refuses when any open
   * obligation exists (funds, pending INR deposit/withdrawal, open orders,
   * unresolved compliance hold, open support case). On success the user is
   * removed from every active list, ALL history is preserved, and existing
   * sessions/tokens are revoked so the user cannot continue an in-flight session.
   */
  async archiveUser(
    userId: string,
    input: { reason: string },
    ctx: AdminUserContext,
  ): Promise<AdminArchivedUserDetailDto> {
    await ensureSuperAdmin(ctx);
    const existing = await adminUsersRepository.findActiveUser(userId);
    if (!existing) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const obligations = await adminUsersRepository.userArchiveObligations(userId);
    const blockers = collectArchiveBlockers(obligations);
    if (blockers.length > 0) {
      // Audit the blocked attempt (accountability) but never move money.
      await this.auditAdmin(ctx, {
        action: 'admin.user.archive_blocked',
        targetType: 'user',
        targetId: userId,
        afterState: { event: 'USER_ARCHIVE_BLOCKED', blockers },
      });
      throw new ForbiddenError(ARCHIVE_BLOCKED_MESSAGE, 'USER_ARCHIVE_BLOCKED');
    }

    const updated = await adminUsersRepository.archiveUser(userId, {
      deletedByAdminId: ctx.actorId,
      reason: input.reason,
    });
    // Revoke live sessions/tokens: USER_ARCHIVED_BY_ADMIN.
    const revoked = await adminUsersRepository.revokeAllUserSessions(userId);

    await this.auditAdmin(ctx, {
      action: 'admin.user.archived',
      targetType: 'user',
      targetId: userId,
      beforeState: userState(existing),
      afterState: {
        event: 'USER_ARCHIVED',
        status: updated.status,
        deletedAt: updated.deletedAt,
        reason: input.reason,
        revokedSessions: revoked.count,
        sessionRevokeReason: 'USER_ARCHIVED_BY_ADMIN',
      },
    });
    return this.getArchivedUser(userId, {});
  },

  /**
   * Restore a previously archived user. SUPER_ADMIN only. Blocked while a
   * compliance hold is unresolved. Old sessions are NOT restored — the user
   * must sign in fresh.
   */
  async restoreUser(
    userId: string,
    input: { reason: string },
    ctx: AdminUserContext,
  ): Promise<AdminUserListItemDto> {
    await ensureSuperAdmin(ctx);
    const existing = await adminUsersRepository.findArchivedUser(userId);
    if (!existing) throw new NotFoundError('Archived user not found', 'USER_NOT_FOUND');

    const obligations = await adminUsersRepository.userArchiveObligations(userId);
    if (obligations.openComplianceCases > 0 || obligations.underComplianceReview) {
      throw new ConflictError(
        'User cannot be restored while a compliance hold is unresolved.',
        'USER_RESTORE_BLOCKED',
      );
    }

    const updated = await adminUsersRepository.restoreUser(userId);
    await this.auditAdmin(ctx, {
      action: 'admin.user.restored',
      targetType: 'user',
      targetId: userId,
      beforeState: {
        status: existing.status,
        deletedAt: existing.deletedAt,
        reason: input.reason,
      },
      afterState: { event: 'USER_RESTORED', status: updated.status },
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
