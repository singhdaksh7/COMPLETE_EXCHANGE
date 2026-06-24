import {
  Prisma,
  type AdminLog,
  type AuthSession,
  type ComplianceAlert,
  type ComplianceCase,
  type ComplianceProfile,
  type CryptoDeposit,
  type CryptoWithdrawal,
  type InrTransaction,
  type KycProfile,
  type Order,
  type ScreeningCheck,
  type Trade,
  type User,
  type UserFeatureControls,
  type WalletRiskCheck,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/** How many rows the aggregate endpoint embeds per section (first page). */
export const PROFILE_PAGE_SIZE = 10;

export type ProfileHeaderRow = User & {
  kycProfile: KycProfile | null;
  complianceProfile: ComplianceProfile | null;
  featureControls: UserFeatureControls | null;
  accounts: Array<{
    asset: string;
    kind: string;
    balance: { balance: Prisma.Decimal } | null;
  }>;
};

/** Fetch `limit + 1` rows so the caller can derive `nextCursor`. */
function uuidCursor(cursor: string | undefined, limit: number) {
  return {
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  };
}

export const adminUserProfileRepository = {
  /** Identity + KYC + compliance posture + feature controls + balances. */
  findHeader(userId: string): Promise<ProfileHeaderRow | null> {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        kycProfile: true,
        complianceProfile: true,
        featureControls: true,
        accounts: {
          where: { kind: { in: ['USER_AVAILABLE', 'USER_LOCKED'] } },
          select: { asset: true, kind: true, balance: { select: { balance: true } } },
          orderBy: [{ asset: 'asc' }, { kind: 'asc' }],
        },
      },
    });
  },

  /** Lightweight existence/state check (no heavy includes). */
  findUserState(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, status: true },
    });
  },

  inrTransactions(
    userId: string,
    type: 'DEPOSIT' | 'WITHDRAWAL',
    cursor: string | undefined,
    limit: number,
  ): Promise<InrTransaction[]> {
    return prisma.inrTransaction.findMany({
      where: { userId, type },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...uuidCursor(cursor, limit),
    });
  },

  cryptoDeposits(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CryptoDeposit[]> {
    return prisma.cryptoDeposit.findMany({
      where: { userId },
      orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      ...uuidCursor(cursor, limit),
    });
  },

  cryptoWithdrawals(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CryptoWithdrawal[]> {
    return prisma.cryptoWithdrawal.findMany({
      where: { userId },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      ...uuidCursor(cursor, limit),
    });
  },

  orders(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Array<Order & { market: { symbol: string } }>> {
    return prisma.order.findMany({
      where: { userId },
      include: { market: { select: { symbol: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...uuidCursor(cursor, limit),
    });
  },

  /**
   * Trades touch the user as maker or taker. Trade has a composite PK and a
   * monotonic `seq`, so we keyset-paginate on `seq` (cursor = last seq seen).
   */
  trades(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Array<Trade & { market: { symbol: string } }>> {
    const seqCursor = cursor ? { seq: { lt: BigInt(cursor) } } : {};
    return prisma.trade.findMany({
      where: {
        AND: [{ OR: [{ makerUserId: userId }, { takerUserId: userId }] }, seqCursor],
      },
      include: { market: { select: { symbol: true } } },
      orderBy: { seq: 'desc' },
      take: limit + 1,
    });
  },

  sessions(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<AuthSession[]> {
    return prisma.authSession.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...uuidCursor(cursor, limit),
    });
  },

  /**
   * Admin-action audit trail for this user. AdminLog rows where targetId is the
   * user cover BOTH direct user actions (freeze/risk/withdrawal-block) AND
   * per-user feature-control changes (targetType = 'user_feature_controls'),
   * because both write the userId as targetId. BigInt id is stringified for the
   * cursor.
   */
  auditTrail(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<AdminLog[]> {
    const idCursor = cursor ? { id: { lt: BigInt(cursor) } } : {};
    return prisma.adminLog.findMany({
      where: { AND: [{ targetId: userId }, idCursor] },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
  },

  // --- Risk / compliance reads (gated by compliance.view in the service) ---

  latestScreeningChecks(userId: string): Promise<ScreeningCheck[]> {
    return prisma.screeningCheck.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  },

  openAlerts(userId: string): Promise<ComplianceAlert[]> {
    return prisma.complianceAlert.findMany({
      where: { userId, status: { in: ['OPEN', 'IN_REVIEW', 'LINKED_TO_CASE'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  },

  walletRiskChecks(userId: string): Promise<WalletRiskCheck[]> {
    return prisma.walletRiskCheck.findMany({
      where: { userId, status: { in: ['REVIEW_REQUIRED', 'BLOCKED'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  },

  openCases(userId: string): Promise<ComplianceCase[]> {
    return prisma.complianceCase.findMany({
      where: { userId, status: { not: 'CLOSED' } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  },
};

export type AdminUserProfileRepository = typeof adminUserProfileRepository;
