import {
  Prisma,
  type ComplianceAlert,
  type ComplianceAlertType,
  type ComplianceCase,
  type ComplianceCaseStatus,
  type ComplianceKycStatus,
  type ComplianceProfile,
  type ComplianceRiskLevel,
  type CryptoWithdrawal,
  type FiuDraftReport,
  type FiuDraftStatus,
  type ScreeningStatus,
  type WalletRiskCheck,
  type WithdrawalStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Read-only repository for the compliance dashboard aggregate (Stage 4A).
 *
 * It ONLY counts and previews existing rows — it never writes and never moves
 * money. Every number is a real `count()` over real tables; there are no
 * synthetic/sample values. Queue previews return small, masked, secrets-free
 * slices so the dashboard never ships PII (raw PAN/Aadhaar/addresses live on the
 * detail pages behind their own finer permissions).
 */

/** Withdrawal statuses that represent a pending manual/risk review. */
const WITHDRAWAL_REVIEW_STATUSES: WithdrawalStatus[] = ['RISK_CHECK', 'PENDING_APPROVAL'];

/** Compliance KYC statuses that represent an open review item. */
const KYC_REVIEW_STATUSES: ComplianceKycStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_MORE_INFO',
];

/** A per-dimension screening posture that is an active flag. */
const SCREENING_FLAG_STATUSES: ScreeningStatus[] = ['HIT', 'REVIEW_REQUIRED'];

/** Open case statuses (anything not CLOSED). */
const OPEN_CASE_STATUSES: ComplianceCaseStatus[] = [
  'OPEN',
  'IN_REVIEW',
  'ESCALATED',
  'STR_DRAFTED',
];

/** FIU draft statuses that are still "in progress" (not archived). */
const OPEN_FIU_STATUSES: FiuDraftStatus[] = [
  'DRAFT',
  'VALIDATING',
  'READY_FOR_INTERNAL_REVIEW',
];

export interface DashboardFilters {
  riskLevel?: ComplianceRiskLevel;
  caseStatus?: ComplianceCaseStatus;
  alertType?: ComplianceAlertType;
  assignedAdminId?: string;
  from?: Date;
  to?: Date;
  previewLimit: number;
}

function dateRange(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

export const dashboardRepository = {
  // ---------------------------------------------------------------- counts
  async counts() {
    const [
      pendingKycReviews,
      enhancedKycRequired,
      highRiskUsers,
      openCases,
      highCriticalCases,
      openAlerts,
      pendingWithdrawalReviews,
      screeningFlaggedUsers,
      walletRiskAlerts,
      openStrDrafts,
    ] = await Promise.all([
      prisma.complianceProfile.count({ where: { status: { in: KYC_REVIEW_STATUSES } } }),
      prisma.userFeatureControls.count({ where: { requireEnhancedKyc: true } }),
      prisma.complianceProfile.count({ where: { riskLevel: { in: ['HIGH', 'PROHIBITED'] } } }),
      prisma.complianceCase.count({ where: { status: { in: OPEN_CASE_STATUSES } } }),
      prisma.complianceCase.count({
        where: { status: { in: OPEN_CASE_STATUSES }, priority: { in: ['HIGH', 'CRITICAL'] } },
      }),
      prisma.complianceAlert.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      prisma.cryptoWithdrawal.count({ where: { status: { in: WITHDRAWAL_REVIEW_STATUSES } } }),
      prisma.complianceProfile.count({
        where: {
          OR: [
            { sanctionsStatus: { in: SCREENING_FLAG_STATUSES } },
            { pepStatus: { in: SCREENING_FLAG_STATUSES } },
            { adverseMediaStatus: { in: SCREENING_FLAG_STATUSES } },
          ],
        },
      }),
      prisma.walletRiskCheck.count({ where: { status: { in: ['REVIEW_REQUIRED', 'BLOCKED'] } } }),
      prisma.fiuDraftReport.count({ where: { status: { in: OPEN_FIU_STATUSES } } }),
    ]);

    return {
      pendingKycReviews,
      enhancedKycRequired,
      highRiskUsers,
      openCases,
      highCriticalCases,
      openAlerts,
      pendingWithdrawalReviews,
      screeningFlaggedUsers,
      walletRiskAlerts,
      openStrDrafts,
    };
  },

  // ---------------------------------------------------------------- queues
  kycReviewQueue(f: DashboardFilters): Promise<Array<ComplianceProfile & { user: { email: string } }>> {
    return prisma.complianceProfile.findMany({
      where: {
        status: { in: KYC_REVIEW_STATUSES },
        ...(f.riskLevel ? { riskLevel: f.riskLevel } : {}),
        ...(dateRange(f.from, f.to) ? { createdAt: dateRange(f.from, f.to) } : {}),
      },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
      take: f.previewLimit,
    }) as Promise<Array<ComplianceProfile & { user: { email: string } }>>;
  },

  riskReviewQueue(f: DashboardFilters): Promise<Array<ComplianceProfile & { user: { email: string } }>> {
    return prisma.complianceProfile.findMany({
      where: {
        riskLevel: f.riskLevel ?? { in: ['HIGH', 'PROHIBITED'] },
        ...(dateRange(f.from, f.to) ? { updatedAt: dateRange(f.from, f.to) } : {}),
      },
      include: { user: { select: { email: true } } },
      orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
      take: f.previewLimit,
    }) as Promise<Array<ComplianceProfile & { user: { email: string } }>>;
  },

  withdrawalReviewQueue(f: DashboardFilters): Promise<Array<CryptoWithdrawal & { user: { email: string } }>> {
    return prisma.cryptoWithdrawal.findMany({
      where: {
        status: { in: WITHDRAWAL_REVIEW_STATUSES },
        ...(dateRange(f.from, f.to) ? { requestedAt: dateRange(f.from, f.to) } : {}),
      },
      include: { user: { select: { email: true } } },
      orderBy: { requestedAt: 'asc' },
      take: f.previewLimit,
    }) as Promise<Array<CryptoWithdrawal & { user: { email: string } }>>;
  },

  caseQueue(f: DashboardFilters): Promise<Array<ComplianceCase & { user: { email: string } }>> {
    return prisma.complianceCase.findMany({
      where: {
        status: f.caseStatus ?? { in: OPEN_CASE_STATUSES },
        ...(f.assignedAdminId ? { assignedToAdminId: f.assignedAdminId } : {}),
        ...(dateRange(f.from, f.to) ? { createdAt: dateRange(f.from, f.to) } : {}),
      },
      include: { user: { select: { email: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: f.previewLimit,
    }) as Promise<Array<ComplianceCase & { user: { email: string } }>>;
  },

  strDraftQueue(f: DashboardFilters): Promise<FiuDraftReport[]> {
    return prisma.fiuDraftReport.findMany({
      where: {
        status: { in: OPEN_FIU_STATUSES },
        ...(dateRange(f.from, f.to) ? { createdAt: dateRange(f.from, f.to) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: f.previewLimit,
    });
  },

  alertQueue(f: DashboardFilters): Promise<Array<ComplianceAlert & { user: { email: string } }>> {
    return prisma.complianceAlert.findMany({
      where: {
        status: { in: ['OPEN', 'IN_REVIEW'] },
        ...(f.alertType ? { type: f.alertType } : {}),
        ...(dateRange(f.from, f.to) ? { createdAt: dateRange(f.from, f.to) } : {}),
      },
      include: { user: { select: { email: true } } },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: f.previewLimit,
    }) as Promise<Array<ComplianceAlert & { user: { email: string } }>>;
  },

  walletRiskQueue(f: DashboardFilters): Promise<WalletRiskCheck[]> {
    return prisma.walletRiskCheck.findMany({
      where: {
        status: { in: ['REVIEW_REQUIRED', 'BLOCKED'] },
        ...(dateRange(f.from, f.to) ? { createdAt: dateRange(f.from, f.to) } : {}),
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: f.previewLimit,
    });
  },
};

export type DashboardRepository = typeof dashboardRepository;
