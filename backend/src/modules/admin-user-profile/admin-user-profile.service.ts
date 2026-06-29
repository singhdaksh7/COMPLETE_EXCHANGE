import {
  Prisma,
  type AdminLog,
  type AuthSession,
  type ComplianceAlert,
  type ComplianceCase,
  type ComplianceNote,
  type CryptoDeposit,
  type CryptoWithdrawal,
  type InrTransaction,
  type Order,
  type ScreeningCheck,
  type Trade,
  type WalletRiskCheck,
} from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { AuditAction } from '../../lib/audit';
import { recordAudit } from '../../lib/audit';
import {
  PROFILE_PAGE_SIZE,
  adminUserProfileRepository,
  type ProfileHeaderRow,
} from './admin-user-profile.repository';
import type {
  AuditTrailDto,
  BalanceDto,
  ComplianceNoteDto,
  CryptoDepositDto,
  CryptoWithdrawalDto,
  IdentityDto,
  InrTxnDto,
  KycDto,
  OrderDto,
  ProfilePage,
  ProfileSection,
  RiskComplianceDto,
  RiskFlagDto,
  SessionDto,
  TradeDto,
  UserProfileDto,
} from './admin-user-profile.types';

export interface ProfileContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** What the calling admin is allowed to see/do, resolved from RBAC upstream. */
export interface ProfileViewer {
  complianceVisible: boolean;
  canRevokeSessions: boolean;
  canManageNotes: boolean;
}

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

/** Build a page from `limit + 1` rows: derive nextCursor, then slice to limit. */
function paginate<Row, Dto>(
  rows: Row[],
  limit: number,
  toDto: (row: Row) => Dto,
  cursorOf: (row: Row) => string,
): ProfilePage<Dto> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: slice.map(toDto),
    nextCursor: hasMore ? cursorOf(slice[slice.length - 1]) : null,
  };
}

// --------------------------------------------------------------------------
// Mappers — every value comes straight from a DB row (no synthetic data).
// --------------------------------------------------------------------------

function toIdentity(row: ProfileHeaderRow): IdentityDto {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    emailVerified: row.emailVerifiedAt !== null,
    emailVerifiedAt: iso(row.emailVerifiedAt),
    phoneVerifiedAt: iso(row.phoneVerifiedAt),
    accountStatus: row.status,
    kycStatus: row.kycStatus,
    kycTier: row.kycTier,
    riskLevel: row.riskLevel,
    riskNote: row.riskNote,
    withdrawalsBlocked: row.withdrawalsBlocked,
    totpEnabled: row.totpEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toKyc(row: ProfileHeaderRow): KycDto {
  const k = row.kycProfile;
  return {
    exists: k !== null,
    status: k?.status ?? row.kycStatus,
    tier: row.kycTier,
    fullName: k?.fullName ?? null,
    provider: k?.provider ?? null,
    providerRef: k?.providerRef ?? null,
    panMasked: k?.panMasked ?? null,
    aadhaarMasked: k?.aadhaarMasked ?? null,
    livenessStatus: k?.livenessStatus ?? null,
    documentStatus: k?.documentStatus ?? null,
    riskScore: k?.riskScore ?? null,
    rejectedReason: k?.rejectedReason ?? null,
    reviewedAt: iso(k?.reviewedAt ?? null),
    reviewedByAdminId: k?.reviewedBy ?? null,
    submittedAt: iso(k?.createdAt ?? null),
    enhancedKycRequired: row.featureControls?.requireEnhancedKyc ?? false,
  };
}

function toBalances(row: ProfileHeaderRow): BalanceDto[] {
  const byAsset = new Map<
    string,
    { available: Prisma.Decimal; locked: Prisma.Decimal }
  >();
  for (const account of row.accounts) {
    const key = account.asset.toUpperCase();
    const cur =
      byAsset.get(key) ?? {
        available: new Prisma.Decimal(0),
        locked: new Prisma.Decimal(0),
      };
    const bal = account.balance?.balance ?? new Prisma.Decimal(0);
    if (account.kind === 'USER_AVAILABLE') cur.available = cur.available.add(bal);
    if (account.kind === 'USER_LOCKED') cur.locked = cur.locked.add(bal);
    byAsset.set(key, cur);
  }
  return [...byAsset.entries()].map(([asset, v]) => ({
    asset,
    available: v.available.toFixed(),
    locked: v.locked.toFixed(),
    total: v.available.add(v.locked).toFixed(),
  }));
}

function toInrTxn(row: InrTransaction): InrTxnDto {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount.toFixed(),
    fee: row.fee.toFixed(),
    status: row.status,
    provider: row.provider,
    method: row.method,
    utr: row.utr,
    bankRef: row.bankRef,
    reviewedByAdminId: row.reviewedBy,
    reviewedAt: iso(row.reviewedAt),
    firstApprovedByAdminId: row.firstApprovedBy,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCryptoDeposit(row: CryptoDeposit): CryptoDepositDto {
  return {
    id: row.id,
    asset: row.asset,
    chain: row.chain,
    amount: row.amount.toFixed(),
    txHash: row.txHash,
    confirmations: row.confirmations,
    reqConfirmations: row.reqConfirmations,
    status: row.status,
    fromAddress: row.fromAddress,
    detectedAt: row.detectedAt.toISOString(),
    creditedAt: iso(row.creditedAt),
  };
}

function toCryptoWithdrawal(row: CryptoWithdrawal): CryptoWithdrawalDto {
  return {
    id: row.id,
    asset: row.asset,
    chain: row.chain,
    amount: row.amount.toFixed(),
    fee: row.fee.toFixed(),
    netAmount: row.netAmount.toFixed(),
    toAddress: row.toAddress,
    txHash: row.txHash,
    status: row.status,
    approvedByAdminId: row.approvedBy,
    approvedBy2AdminId: row.approvedBy2,
    failureReason: row.failureReason,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: iso(row.completedAt),
  };
}

function toOrder(row: Order & { market: { symbol: string } }): OrderDto {
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
    createdAt: row.createdAt.toISOString(),
    closedAt: iso(row.closedAt),
  };
}

function toTrade(userId: string) {
  return (row: Trade & { market: { symbol: string } }): TradeDto => {
    // The user's side: if they are the maker, their side is makerSide; if the
    // taker, it is the opposite. Their fee is the maker/taker fee accordingly.
    const isMaker = row.makerUserId === userId;
    const side = isMaker
      ? row.makerSide
      : row.makerSide === 'BUY'
        ? 'SELL'
        : 'BUY';
    const fee = isMaker ? row.makerFee : row.takerFee;
    return {
      id: row.id,
      seq: row.seq.toString(),
      marketSymbol: row.market.symbol,
      side,
      price: row.price.toFixed(),
      quantity: row.quantity.toFixed(),
      quoteAmount: row.quoteAmount.toFixed(),
      fee: fee.toFixed(),
      executedAt: row.executedAt.toISOString(),
    };
  };
}

function toSession(row: AuthSession): SessionDto {
  const active = row.revokedAt === null && row.expiresAt.getTime() > Date.now();
  return {
    id: row.id,
    ip: row.ip,
    deviceInfo: row.deviceInfo,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: iso(row.lastSeenAt),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: iso(row.revokedAt),
    active,
  };
}

function toComplianceNote(row: ComplianceNote): ComplianceNoteDto {
  return {
    id: row.id,
    adminId: row.adminId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditTrail(row: AdminLog): AuditTrailDto {
  return {
    id: row.id.toString(),
    adminId: row.adminId,
    action: row.action,
    targetType: row.targetType,
    reason: row.reason,
    beforeState: row.beforeState,
    afterState: row.afterState,
    ip: row.ip,
    occurredAt: row.occurredAt.toISOString(),
  };
}

// --------------------------------------------------------------------------
// Risk / compliance aggregation (read-only).
// --------------------------------------------------------------------------

function buildScreeningFlags(checks: ScreeningCheck[]): RiskFlagDto[] {
  // A check is a live risk signal when it found a possible match and has not
  // been cleared by an admin decision (APPROVED / FALSE_POSITIVE).
  return checks
    .filter(
      (c) =>
        c.status === 'POSSIBLE_MATCH' &&
        c.decision !== 'APPROVED' &&
        c.decision !== 'FALSE_POSITIVE',
    )
    .map((c) => ({
      kind: 'SCREENING' as const,
      label: c.category,
      status: c.decision ?? c.status,
      level: null,
      detail: c.summary,
      createdAt: c.createdAt.toISOString(),
    }));
}

function buildWalletFlags(checks: WalletRiskCheck[]): RiskFlagDto[] {
  return checks.map((c) => ({
    kind: 'WALLET_RISK' as const,
    label: `${c.chain}:${c.address.slice(0, 10)}…`,
    status: c.status,
    level: c.level,
    detail: c.summary,
    createdAt: c.createdAt.toISOString(),
  }));
}

function buildAlertFlags(alerts: ComplianceAlert[]): RiskFlagDto[] {
  return alerts.map((a) => ({
    kind: 'ALERT' as const,
    label: a.type,
    status: a.status,
    level: a.priority,
    detail: a.title,
    createdAt: a.createdAt.toISOString(),
  }));
}

async function buildRiskCompliance(
  userId: string,
  header: ProfileHeaderRow,
  visible: boolean,
): Promise<RiskComplianceDto> {
  const fc = header.featureControls;
  const manualHold = {
    underComplianceReview: fc?.underComplianceReview ?? false,
    manualReviewBeforeWithdrawal: fc?.manualReviewBeforeWithdrawal ?? false,
    blockHighRiskActivity: fc?.blockHighRiskActivity ?? false,
    forceKycReview: fc?.forceKycReview ?? false,
    requireEnhancedKyc: fc?.requireEnhancedKyc ?? false,
  };

  if (!visible) {
    return { visible: false, screening: null, manualHold, flags: [], openCases: [] };
  }

  const [checks, alerts, wallet, cases] = await Promise.all([
    adminUserProfileRepository.latestScreeningChecks(userId),
    adminUserProfileRepository.openAlerts(userId),
    adminUserProfileRepository.walletRiskChecks(userId),
    adminUserProfileRepository.openCases(userId),
  ]);

  const cp = header.complianceProfile;
  return {
    visible: true,
    screening: cp
      ? {
          sanctionsStatus: cp.sanctionsStatus,
          pepStatus: cp.pepStatus,
          adverseMediaStatus: cp.adverseMediaStatus,
          complianceRiskLevel: cp.riskLevel,
          complianceRiskScore: cp.riskScore,
        }
      : null,
    manualHold,
    flags: [
      ...buildScreeningFlags(checks),
      ...buildWalletFlags(wallet),
      ...buildAlertFlags(alerts),
    ],
    openCases: cases.map((c: ComplianceCase) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      priority: c.priority,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

export const adminUserProfileService = {
  /** Full aggregate profile. Compliance/risk sections gated by `viewer`. */
  async getProfile(
    userId: string,
    viewer: ProfileViewer,
    ctx: ProfileContext = {},
  ): Promise<UserProfileDto> {
    const header = await adminUserProfileRepository.findHeader(userId);
    if (!header) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const limit = PROFILE_PAGE_SIZE;
    const [
      inrDeposits,
      inrWithdrawals,
      cryptoDeposits,
      cryptoWithdrawals,
      orders,
      trades,
      sessions,
      auditTrail,
      riskCompliance,
      complianceNotes,
    ] = await Promise.all([
      adminUserProfileRepository
        .inrTransactions(userId, 'DEPOSIT', undefined, limit)
        .then((r) => paginate(r, limit, toInrTxn, (x) => x.id)),
      adminUserProfileRepository
        .inrTransactions(userId, 'WITHDRAWAL', undefined, limit)
        .then((r) => paginate(r, limit, toInrTxn, (x) => x.id)),
      adminUserProfileRepository
        .cryptoDeposits(userId, undefined, limit)
        .then((r) => paginate(r, limit, toCryptoDeposit, (x) => x.id)),
      adminUserProfileRepository
        .cryptoWithdrawals(userId, undefined, limit)
        .then((r) => paginate(r, limit, toCryptoWithdrawal, (x) => x.id)),
      adminUserProfileRepository
        .orders(userId, undefined, limit)
        .then((r) => paginate(r, limit, toOrder, (x) => x.id)),
      adminUserProfileRepository
        .trades(userId, undefined, limit)
        .then((r) => paginate(r, limit, toTrade(userId), (x) => x.seq.toString())),
      adminUserProfileRepository
        .sessions(userId, undefined, limit)
        .then((r) => paginate(r, limit, toSession, (x) => x.id)),
      adminUserProfileRepository
        .auditTrail(userId, undefined, limit)
        .then((r) => paginate(r, limit, toAuditTrail, (x) => x.id.toString())),
      buildRiskCompliance(userId, header, viewer.complianceVisible),
      // Compliance notes are part of the compliance surface: only loaded when
      // the caller may see it (compliance.view), otherwise null (hidden).
      viewer.complianceVisible
        ? adminUserProfileRepository
            .complianceNotes(userId, undefined, limit)
            .then((r) => paginate(r, limit, toComplianceNote, (x) => x.id))
        : Promise.resolve(null),
    ]);

    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: 'admin.user.profile_view',
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { complianceVisible: viewer.complianceVisible },
    });

    return {
      identity: toIdentity(header),
      kyc: toKyc(header),
      balances: toBalances(header),
      inrDeposits,
      inrWithdrawals,
      cryptoDeposits,
      cryptoWithdrawals,
      orders,
      trades,
      sessions,
      auditTrail,
      riskCompliance,
      complianceNotes,
      meta: {
        complianceVisible: viewer.complianceVisible,
        canRevokeSessions: viewer.canRevokeSessions,
        canManageNotes: viewer.canManageNotes,
      },
    };
  },

  /** One paginated section (drill-down beyond the embedded first page). */
  async getSection(
    userId: string,
    section: ProfileSection,
    cursor: string | undefined,
    limit: number,
  ): Promise<ProfilePage<unknown>> {
    const exists = await adminUserProfileRepository.findUserState(userId);
    if (!exists) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const repo = adminUserProfileRepository;
    switch (section) {
      case 'inrDeposits':
        return paginate(
          await repo.inrTransactions(userId, 'DEPOSIT', cursor, limit),
          limit,
          toInrTxn,
          (x) => x.id,
        );
      case 'inrWithdrawals':
        return paginate(
          await repo.inrTransactions(userId, 'WITHDRAWAL', cursor, limit),
          limit,
          toInrTxn,
          (x) => x.id,
        );
      case 'cryptoDeposits':
        return paginate(
          await repo.cryptoDeposits(userId, cursor, limit),
          limit,
          toCryptoDeposit,
          (x) => x.id,
        );
      case 'cryptoWithdrawals':
        return paginate(
          await repo.cryptoWithdrawals(userId, cursor, limit),
          limit,
          toCryptoWithdrawal,
          (x) => x.id,
        );
      case 'orders':
        return paginate(
          await repo.orders(userId, cursor, limit),
          limit,
          toOrder,
          (x) => x.id,
        );
      case 'trades':
        return paginate(
          await repo.trades(userId, cursor, limit),
          limit,
          toTrade(userId),
          (x) => x.seq.toString(),
        );
      case 'sessions':
        return paginate(
          await repo.sessions(userId, cursor, limit),
          limit,
          toSession,
          (x) => x.id,
        );
      case 'auditTrail':
        return paginate(
          await repo.auditTrail(userId, cursor, limit),
          limit,
          toAuditTrail,
          (x) => x.id.toString(),
        );
    }
  },

  /**
   * Admin-initiated revoke of a single user session (Stage 5C). RBAC-gated
   * upstream (users.manage). Revoking is scoped to the user so an admin can
   * never revoke another user's session by id. Both the append-only audit log
   * and the admin log record who did it. Idempotent: revoking an already
   * revoked/expired session is a no-op success.
   */
  async revokeSession(
    userId: string,
    sessionId: string,
    ctx: ProfileContext = {},
  ): Promise<{ revoked: boolean }> {
    const exists = await adminUserProfileRepository.findUserState(userId);
    if (!exists) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const count = await adminUserProfileRepository.revokeSession(userId, sessionId);
    const revoked = count > 0;

    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: AuditAction.SESSION_REVOKED,
      entityType: 'auth_session',
      entityId: sessionId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { userId, revoked, by: 'ADMIN' },
    });
    if (ctx.actorId) {
      await adminUserProfileRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: 'admin.user.session_revoke',
        targetType: 'user',
        targetId: userId,
        afterState: { sessionId, revoked },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
    return { revoked };
  },

  /** Paginated compliance notes for a user (RBAC compliance.view upstream). */
  async listComplianceNotes(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ProfilePage<ComplianceNoteDto>> {
    const exists = await adminUserProfileRepository.findUserState(userId);
    if (!exists) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    const rows = await adminUserProfileRepository.complianceNotes(userId, cursor, limit);
    return paginate(rows, limit, toComplianceNote, (x) => x.id);
  },

  /**
   * Append a compliance note (Stage 5D). RBAC-gated upstream
   * (compliance.case.manage). Notes are append-only — there is no edit/delete
   * path in this first version. Every note records its author (admin id) and is
   * written to both the append-only audit log and the admin log.
   */
  async addComplianceNote(
    userId: string,
    body: string,
    ctx: ProfileContext = {},
  ): Promise<ComplianceNoteDto> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new ForbiddenError('Note body is required', 'NOTE_BODY_REQUIRED');
    }
    const exists = await adminUserProfileRepository.findUserState(userId);
    if (!exists) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const note = await adminUserProfileRepository.createComplianceNote(
      userId,
      ctx.actorId ?? null,
      trimmed,
    );

    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: 'admin.user.compliance_note_add',
      entityType: 'compliance_note',
      entityId: note.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { userId },
    });
    if (ctx.actorId) {
      await adminUserProfileRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: 'admin.user.compliance_note_add',
        targetType: 'user',
        targetId: userId,
        afterState: { noteId: note.id },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
    return toComplianceNote(note);
  },
};

export type AdminUserProfileService = typeof adminUserProfileService;
