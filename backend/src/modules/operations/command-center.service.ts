import {
  type AdminLog,
  type ComplianceAlert,
  type ComplianceCase,
  type CryptoWithdrawal,
  type InrTransaction,
} from '@prisma/client';
import { logger } from '../../lib/logger';
import { systemService } from '../system/system.service';
import {
  commandCenterRepository,
  type CommandCenterCounts,
} from './command-center.repository';

/**
 * Stage 8A admin command center aggregate.
 *
 * Combines real counts, operational/risk queues, recent activity and a system
 * health snapshot into one read-only view. No fake data: every number is a real
 * count and every queue is a real DB slice (empty arrays when nothing is
 * pending). System health is best-effort — if the readiness probe fails the
 * card degrades to an "unavailable" state instead of breaking the page.
 */

const PREVIEW = 6;

function maskAddress(addr: string | null): string | null {
  if (!addr) return null;
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export interface SystemHealthCard {
  available: boolean;
  status: 'ok' | 'degraded' | 'unavailable';
  version: string | null;
  uptimeSec: number | null;
  dependencies: Array<{ name: string; status: string }>;
}

export interface CommandCenterDto {
  cards: CommandCenterCounts & { systemHealth: 'ok' | 'degraded' | 'unavailable' };
  operationsQueue: {
    pendingInrDeposits: Array<{ id: string; userId: string; email: string; amount: string; status: string; createdAt: string }>;
    pendingInrWithdrawals: Array<{ id: string; userId: string; email: string; amount: string; status: string; createdAt: string }>;
    cryptoWithdrawalsForReview: Array<{ id: string; userId: string; email: string; asset: string; chain: string; amount: string; status: string; requestedAt: string }>;
    pendingKycReviews: Array<{ userId: string; email: string; kycStatus: string; riskLevel: string; createdAt: string }>;
    usersUnderComplianceReview: Array<{ userId: string; email: string }>;
  };
  riskQueue: {
    highRiskUsers: Array<{ userId: string; email: string; riskLevel: string; riskNote: string | null }>;
    walletRiskAlerts: Array<{ id: string; chain: string; address: string; level: string; status: string; score: number; checkedAt: string }>;
    complianceAlerts: Array<{ id: string; userId: string; email: string; type: string; priority: string; score: number; title: string; createdAt: string }>;
    openCases: Array<{ id: string; userId: string; email: string; type: string; priority: string; status: string; title: string; createdAt: string }>;
  };
  recentActivity: {
    signups: Array<{ userId: string; email: string; kycStatus: string; createdAt: string }>;
    adminActions: Array<{ id: string; adminId: string; adminEmail: string | null; action: string; targetType: string | null; targetId: string | null; occurredAt: string }>;
    inrTransactions: Array<{ id: string; userId: string; email: string; type: string; amount: string; status: string; createdAt: string }>;
    securityEvents: Array<{ id: string; action: string; ip: string | null; occurredAt: string }>;
    highRiskEvents: Array<{ id: string; userId: string; email: string; type: string; priority: string; title: string; createdAt: string }>;
  };
  systemHealth: SystemHealthCard;
  meta: { generatedAt: string; note: string };
}

async function safeHealth(): Promise<SystemHealthCard> {
  try {
    const h = await systemService.health();
    return {
      available: true,
      status: h.status,
      version: h.version,
      uptimeSec: Math.round(h.uptime),
      dependencies: Object.entries(h.dependencies).map(([name, dep]) => ({
        name,
        status: (dep as { status?: string }).status ?? 'unknown',
      })),
    };
  } catch (err) {
    logger.warn({ err }, 'command-center: health probe failed (non-fatal)');
    return { available: false, status: 'unavailable', version: null, uptimeSec: null, dependencies: [] };
  }
}

export const commandCenterService = {
  async getCommandCenter(): Promise<CommandCenterDto> {
    const [
      counts,
      inrDeposits,
      inrWithdrawals,
      cryptoWd,
      kycUsers,
      underReview,
      highRisk,
      walletRisk,
      alerts,
      cases,
      signups,
      adminActions,
      recentInr,
      securityEvents,
      highRiskEvents,
      health,
    ] = await Promise.all([
      commandCenterRepository.counts(),
      commandCenterRepository.pendingInrDeposits(PREVIEW),
      commandCenterRepository.pendingInrWithdrawals(PREVIEW),
      commandCenterRepository.cryptoWithdrawalsForReview(PREVIEW),
      commandCenterRepository.pendingKycUsers(PREVIEW),
      commandCenterRepository.usersUnderComplianceReview(PREVIEW),
      commandCenterRepository.highRiskUsers(PREVIEW),
      commandCenterRepository.walletRiskAlerts(PREVIEW),
      commandCenterRepository.openComplianceAlerts(PREVIEW),
      commandCenterRepository.openCases(PREVIEW),
      commandCenterRepository.recentSignups(PREVIEW),
      commandCenterRepository.recentAdminActions(PREVIEW),
      commandCenterRepository.recentInrTransactions(PREVIEW),
      commandCenterRepository.recentSecurityEvents(PREVIEW),
      commandCenterRepository.recentHighRiskEvents(PREVIEW),
      safeHealth(),
    ]);

    const inr = (t: InrTransaction & { user: { email: string } }) => ({
      id: t.id,
      userId: t.userId,
      email: t.user.email,
      amount: t.amount.toFixed(),
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    });
    const cw = (w: CryptoWithdrawal & { user: { email: string } }) => ({
      id: w.id,
      userId: w.userId,
      email: w.user.email,
      asset: w.asset,
      chain: w.chain,
      amount: w.amount.toFixed(),
      status: w.status,
      requestedAt: w.requestedAt.toISOString(),
    });
    const alert = (a: ComplianceAlert & { user: { email: string } }) => ({
      id: a.id,
      userId: a.userId,
      email: a.user.email,
      type: a.type,
      priority: a.priority,
      score: a.score,
      title: a.title,
      createdAt: a.createdAt.toISOString(),
    });
    const adminAction = (l: AdminLog & { admin: { email: string } | null }) => ({
      id: l.id.toString(),
      adminId: l.adminId,
      adminEmail: l.admin?.email ?? null,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      occurredAt: l.occurredAt.toISOString(),
    });
    const caseRow = (c: ComplianceCase & { user: { email: string } }) => ({
      id: c.id,
      userId: c.userId,
      email: c.user.email,
      type: c.type,
      priority: c.priority,
      status: c.status,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
    });

    return {
      cards: { ...counts, systemHealth: health.status },
      operationsQueue: {
        pendingInrDeposits: inrDeposits.map(inr),
        pendingInrWithdrawals: inrWithdrawals.map(inr),
        cryptoWithdrawalsForReview: cryptoWd.map(cw),
        pendingKycReviews: kycUsers.map((u) => ({
          userId: u.id,
          email: u.email,
          kycStatus: u.kycStatus,
          riskLevel: u.riskLevel,
          createdAt: u.createdAt.toISOString(),
        })),
        usersUnderComplianceReview: underReview.map((u) => ({ userId: u.userId, email: u.user.email })),
      },
      riskQueue: {
        highRiskUsers: highRisk.map((u) => ({ userId: u.id, email: u.email, riskLevel: u.riskLevel, riskNote: u.riskNote })),
        walletRiskAlerts: walletRisk.map((w) => ({
          id: w.id,
          chain: w.chain,
          address: maskAddress(w.address) ?? '—',
          level: w.level,
          status: w.status,
          score: w.score,
          checkedAt: w.createdAt.toISOString(),
        })),
        complianceAlerts: alerts.map(alert),
        openCases: cases.map(caseRow),
      },
      recentActivity: {
        signups: signups.map((u) => ({ userId: u.id, email: u.email, kycStatus: u.kycStatus, createdAt: u.createdAt.toISOString() })),
        adminActions: adminActions.map(adminAction),
        inrTransactions: recentInr.map((t) => ({ ...inr(t), type: t.type })),
        securityEvents: securityEvents.map((e) => ({
          id: e.id.toString(),
          action: e.action,
          ip: e.ip,
          occurredAt: e.occurredAt.toISOString(),
        })),
        highRiskEvents: highRiskEvents.map((a) => ({
          id: a.id,
          userId: a.userId,
          email: a.user.email,
          type: a.type,
          priority: a.priority,
          title: a.title,
          createdAt: a.createdAt.toISOString(),
        })),
      },
      systemHealth: health,
      meta: {
        generatedAt: new Date().toISOString(),
        note: 'Live counts and queues are real DB rows. System health is a best-effort readiness probe; provider values may be mock in staging.',
      },
    };
  },
};

export type CommandCenterService = typeof commandCenterService;
