import {
  type ComplianceAlert,
  type ComplianceCase,
  type ComplianceProfile,
  type CryptoWithdrawal,
  type FiuDraftReport,
  type WalletRiskCheck,
} from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { dashboardRepository, type DashboardFilters } from './dashboard.repository';
import type { ComplianceContext } from './compliance.types';

/**
 * Compliance dashboard aggregate service (Stage 4A).
 *
 * Combines the real counts + queue previews that previously lived across the
 * KYC / case / wallet-risk / FIU summaries into a single admin-ready view. It is
 * READ-ONLY: it audits the view (admin accountability) but performs no writes
 * and exposes no secrets/raw PII.
 */

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** Mask a wallet/destination address to head+tail only. */
function maskAddress(addr: string | null): string | null {
  if (!addr) return null;
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export interface DashboardCardsDto {
  pendingKycReviews: number;
  enhancedKycRequired: number;
  highRiskUsers: number;
  openCases: number;
  highCriticalCases: number;
  openAlerts: number;
  pendingWithdrawalReviews: number;
  screeningFlaggedUsers: number;
  walletRiskAlerts: number;
  openStrDrafts: number;
}

export interface KycQueueItemDto {
  userId: string;
  email: string;
  status: string;
  riskLevel: string;
  riskScore: number;
  submittedAt: string;
}

export interface RiskQueueItemDto {
  userId: string;
  email: string;
  riskLevel: string;
  riskScore: number;
  riskReason: string | null;
  lastReviewedAt: string | null;
  updatedAt: string;
}

export interface WithdrawalQueueItemDto {
  id: string;
  userId: string;
  email: string;
  asset: string;
  chain: string;
  amount: string;
  status: string;
  requestedAt: string;
}

export interface CaseQueueItemDto {
  id: string;
  userId: string;
  email: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  assignedToAdminId: string | null;
  createdAt: string;
}

export interface StrDraftQueueItemDto {
  id: string;
  reportType: string;
  status: string;
  scopeType: string;
  scopeUserId: string | null;
  scopeCaseId: string | null;
  title: string;
  createdAt: string;
}

export interface AlertQueueItemDto {
  id: string;
  userId: string;
  email: string;
  type: string;
  status: string;
  priority: string;
  score: number;
  title: string;
  createdAt: string;
}

export interface WalletRiskQueueItemDto {
  id: string;
  userId: string | null;
  asset: string;
  chain: string;
  address: string;
  level: string;
  status: string;
  score: number;
  checkedAt: string;
}

export interface ComplianceDashboardDto {
  cards: DashboardCardsDto;
  queues: {
    kycReview: KycQueueItemDto[];
    riskReview: RiskQueueItemDto[];
    withdrawalReview: WithdrawalQueueItemDto[];
    openCases: CaseQueueItemDto[];
    strDrafts: StrDraftQueueItemDto[];
    recentAlerts: AlertQueueItemDto[];
    walletRisk: WalletRiskQueueItemDto[];
  };
  meta: {
    generatedAt: string;
    note: string;
    appliedFilters: Record<string, string>;
  };
}

function toKyc(p: ComplianceProfile & { user: { email: string } }): KycQueueItemDto {
  return {
    userId: p.userId,
    email: p.user.email,
    status: p.status,
    riskLevel: p.riskLevel,
    riskScore: p.riskScore,
    submittedAt: p.createdAt.toISOString(),
  };
}

function toRisk(p: ComplianceProfile & { user: { email: string } }): RiskQueueItemDto {
  return {
    userId: p.userId,
    email: p.user.email,
    riskLevel: p.riskLevel,
    riskScore: p.riskScore,
    riskReason: p.riskReason,
    lastReviewedAt: iso(p.lastReviewedAt),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function toWithdrawal(w: CryptoWithdrawal & { user: { email: string } }): WithdrawalQueueItemDto {
  return {
    id: w.id,
    userId: w.userId,
    email: w.user.email,
    asset: w.asset,
    chain: w.chain,
    amount: w.amount.toFixed(),
    status: w.status,
    requestedAt: w.requestedAt.toISOString(),
  };
}

function toCase(c: ComplianceCase & { user: { email: string } }): CaseQueueItemDto {
  return {
    id: c.id,
    userId: c.userId,
    email: c.user.email,
    type: c.type,
    status: c.status,
    priority: c.priority,
    title: c.title,
    assignedToAdminId: c.assignedToAdminId,
    createdAt: c.createdAt.toISOString(),
  };
}

function toStrDraft(r: FiuDraftReport): StrDraftQueueItemDto {
  return {
    id: r.id,
    reportType: r.reportType,
    status: r.status,
    scopeType: r.scopeType,
    scopeUserId: r.scopeUserId,
    scopeCaseId: r.scopeCaseId,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
  };
}

function toAlert(a: ComplianceAlert & { user: { email: string } }): AlertQueueItemDto {
  return {
    id: a.id,
    userId: a.userId,
    email: a.user.email,
    type: a.type,
    status: a.status,
    priority: a.priority,
    score: a.score,
    title: a.title,
    createdAt: a.createdAt.toISOString(),
  };
}

function toWalletRisk(w: WalletRiskCheck): WalletRiskQueueItemDto {
  return {
    id: w.id,
    userId: w.userId,
    asset: w.chain, // wallet-risk is chain-scoped; asset == chain native context
    chain: w.chain,
    address: maskAddress(w.address) ?? '—',
    level: w.level,
    status: w.status,
    score: w.score,
    checkedAt: w.createdAt.toISOString(),
  };
}

export const dashboardService = {
  async getDashboard(
    filters: DashboardFilters,
    ctx: ComplianceContext = {},
  ): Promise<ComplianceDashboardDto> {
    const [
      cards,
      kycReview,
      riskReview,
      withdrawalReview,
      openCases,
      strDrafts,
      recentAlerts,
      walletRisk,
    ] = await Promise.all([
      dashboardRepository.counts(),
      dashboardRepository.kycReviewQueue(filters),
      dashboardRepository.riskReviewQueue(filters),
      dashboardRepository.withdrawalReviewQueue(filters),
      dashboardRepository.caseQueue(filters),
      dashboardRepository.strDraftQueue(filters),
      dashboardRepository.alertQueue(filters),
      dashboardRepository.walletRiskQueue(filters),
    ]);

    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: 'compliance.dashboard.view',
      entityType: 'compliance_dashboard',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { openCases: cards.openCases, openAlerts: cards.openAlerts },
    });

    const appliedFilters: Record<string, string> = {};
    if (filters.riskLevel) appliedFilters.riskLevel = filters.riskLevel;
    if (filters.caseStatus) appliedFilters.caseStatus = filters.caseStatus;
    if (filters.alertType) appliedFilters.alertType = filters.alertType;
    if (filters.assignedAdminId) appliedFilters.assignedAdminId = filters.assignedAdminId;
    if (filters.from) appliedFilters.from = filters.from.toISOString();
    if (filters.to) appliedFilters.to = filters.to.toISOString();

    return {
      cards,
      queues: {
        kycReview: kycReview.map(toKyc),
        riskReview: riskReview.map(toRisk),
        withdrawalReview: withdrawalReview.map(toWithdrawal),
        openCases: openCases.map(toCase),
        strDrafts: strDrafts.map(toStrDraft),
        recentAlerts: recentAlerts.map(toAlert),
        walletRisk: walletRisk.map(toWalletRisk),
      },
      meta: {
        generatedAt: new Date().toISOString(),
        note: 'Counts and queues are real DB rows. Screening/wallet-risk provider values may be mock in staging; this is an internal workflow view, not a regulatory filing.',
        appliedFilters,
      },
    };
  },
};

export type DashboardService = typeof dashboardService;
