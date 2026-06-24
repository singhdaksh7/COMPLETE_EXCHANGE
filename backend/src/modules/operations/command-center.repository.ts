import {
  type AdminLog,
  type ComplianceAlert,
  type ComplianceCase,
  type CryptoWithdrawal,
  type InrTransaction,
  type User,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Read-only repository for the Stage 8A admin command center.
 *
 * Every value is a real `count()` / `findMany()` over existing tables — there is
 * no synthetic data. Queue previews are small, masked and secrets-free; the
 * detail pages keep their own finer permissions for anything sensitive.
 */

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface CommandCenterCounts {
  totalUsers: number;
  newUsersToday: number;
  pendingKyc: number;
  enhancedKycRequired: number;
  openCases: number;
  openAlerts: number;
  pendingInrDeposits: number;
  pendingInrWithdrawals: number;
  pendingCryptoWithdrawals: number;
  failedPaymentEvents: number;
  activeSessions: number;
  adminActionsToday: number;
}

export const commandCenterRepository = {
  async counts(): Promise<CommandCenterCounts> {
    const today = startOfTodayUtc();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    const [
      totalUsers,
      newUsersToday,
      pendingKyc,
      enhancedKycRequired,
      openCases,
      openAlerts,
      pendingInrDeposits,
      pendingInrWithdrawals,
      pendingCryptoWithdrawals,
      failedPaymentEvents,
      activeSessions,
      adminActionsToday,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
      prisma.user.count({
        where: { deletedAt: null, kycStatus: { in: ['PENDING', 'IN_REVIEW', 'MANUAL_REVIEW'] } },
      }),
      prisma.userFeatureControls.count({ where: { requireEnhancedKyc: true } }),
      prisma.complianceCase.count({
        where: { status: { in: ['OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED'] } },
      }),
      prisma.complianceAlert.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      prisma.inrTransaction.count({
        where: { type: 'DEPOSIT', status: { in: ['INITIATED', 'PENDING'] } },
      }),
      prisma.inrTransaction.count({
        where: { type: 'WITHDRAWAL', status: { in: ['INITIATED', 'PENDING'] } },
      }),
      prisma.cryptoWithdrawal.count({
        where: { status: { in: ['RISK_CHECK', 'PENDING_APPROVAL'] } },
      }),
      prisma.inrTransaction.count({
        where: { status: 'FAILED', updatedAt: { gte: dayAgo } },
      }),
      prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      prisma.adminLog.count({ where: { occurredAt: { gte: today } } }),
    ]);

    return {
      totalUsers,
      newUsersToday,
      pendingKyc,
      enhancedKycRequired,
      openCases,
      openAlerts,
      pendingInrDeposits,
      pendingInrWithdrawals,
      pendingCryptoWithdrawals,
      failedPaymentEvents,
      activeSessions,
      adminActionsToday,
    };
  },

  // ---------------------------------------------------------------- queues
  pendingInrDeposits(limit: number): Promise<Array<InrTransaction & { user: { email: string } }>> {
    return prisma.inrTransaction.findMany({
      where: { type: 'DEPOSIT', status: { in: ['INITIATED', 'PENDING'] } },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }) as Promise<Array<InrTransaction & { user: { email: string } }>>;
  },

  pendingInrWithdrawals(limit: number): Promise<Array<InrTransaction & { user: { email: string } }>> {
    return prisma.inrTransaction.findMany({
      where: { type: 'WITHDRAWAL', status: { in: ['INITIATED', 'PENDING'] } },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }) as Promise<Array<InrTransaction & { user: { email: string } }>>;
  },

  cryptoWithdrawalsForReview(limit: number): Promise<Array<CryptoWithdrawal & { user: { email: string } }>> {
    return prisma.cryptoWithdrawal.findMany({
      where: { status: { in: ['RISK_CHECK', 'PENDING_APPROVAL'] } },
      include: { user: { select: { email: true } } },
      orderBy: { requestedAt: 'asc' },
      take: limit,
    }) as Promise<Array<CryptoWithdrawal & { user: { email: string } }>>;
  },

  pendingKycUsers(limit: number): Promise<Array<Pick<User, 'id' | 'email' | 'kycStatus' | 'riskLevel' | 'createdAt'>>> {
    return prisma.user.findMany({
      where: { deletedAt: null, kycStatus: { in: ['PENDING', 'IN_REVIEW', 'MANUAL_REVIEW'] } },
      select: { id: true, email: true, kycStatus: true, riskLevel: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  },

  usersUnderComplianceReview(limit: number): Promise<Array<{ userId: string; user: { email: string } }>> {
    return prisma.userFeatureControls.findMany({
      where: { underComplianceReview: true },
      select: { userId: true, user: { select: { email: true } } },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  },

  // ---- risk queue ----
  highRiskUsers(limit: number): Promise<Array<Pick<User, 'id' | 'email' | 'riskLevel' | 'riskNote'>>> {
    return prisma.user.findMany({
      where: { deletedAt: null, riskLevel: 'HIGH' },
      select: { id: true, email: true, riskLevel: true, riskNote: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  },

  walletRiskAlerts(limit: number) {
    return prisma.walletRiskCheck.findMany({
      where: { status: { in: ['REVIEW_REQUIRED', 'BLOCKED'] } },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  },

  openComplianceAlerts(limit: number): Promise<Array<ComplianceAlert & { user: { email: string } }>> {
    return prisma.complianceAlert.findMany({
      where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
      include: { user: { select: { email: true } } },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    }) as Promise<Array<ComplianceAlert & { user: { email: string } }>>;
  },

  openCases(limit: number): Promise<Array<ComplianceCase & { user: { email: string } }>> {
    return prisma.complianceCase.findMany({
      where: { status: { in: ['OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED'] } },
      include: { user: { select: { email: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    }) as Promise<Array<ComplianceCase & { user: { email: string } }>>;
  },

  // ---- recent activity ----
  recentSignups(limit: number): Promise<Array<Pick<User, 'id' | 'email' | 'kycStatus' | 'createdAt'>>> {
    return prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, email: true, kycStatus: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  recentAdminActions(limit: number): Promise<Array<AdminLog & { admin: { email: string } | null }>> {
    return prisma.adminLog.findMany({
      include: { admin: { select: { email: true } } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    }) as Promise<Array<AdminLog & { admin: { email: string } | null }>>;
  },

  recentInrTransactions(limit: number): Promise<Array<InrTransaction & { user: { email: string } }>> {
    return prisma.inrTransaction.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }) as Promise<Array<InrTransaction & { user: { email: string } }>>;
  },

  /** Recent failed security/auth events (login failures, OTP lockouts, etc.). */
  recentSecurityEvents(limit: number) {
    return prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'auth.login_failed',
            'auth.login_locked',
            'auth.otp_failed',
            'auth.otp_locked',
            'auth.token_reuse_detected',
            'auth.login_new_device',
          ],
        },
      },
      select: { id: true, action: true, ip: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  },

  /** Recent high-risk events: HIGH/CRITICAL alerts most recently raised. */
  recentHighRiskEvents(limit: number): Promise<Array<ComplianceAlert & { user: { email: string } }>> {
    return prisma.complianceAlert.findMany({
      where: { priority: { in: ['HIGH', 'CRITICAL'] } },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }) as Promise<Array<ComplianceAlert & { user: { email: string } }>>;
  },
};

export type CommandCenterRepository = typeof commandCenterRepository;
