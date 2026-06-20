import type {
  KycCheckStatus,
  KycDocType,
  KycDocument,
  KycProfile,
  KycStatus,
  Prisma,
  User,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { AdminKycProfileRow } from './kyc.types';

/**
 * Repository layer: the ONLY place that talks to Prisma for KYC data.
 *
 * Multi-row state transitions (profile + user.kycStatus/tier + documents) are
 * wrapped in interactive transactions so a partially-applied decision can never
 * be observed. The DB schema is frozen — this layer only reads/writes it.
 */
export const kycRepository = {
  findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, kycStatus: true, kycTier: true },
    });
  },

  findProfileByUserId(userId: string): Promise<KycProfile | null> {
    return prisma.kycProfile.findUnique({ where: { userId } });
  },

  /**
   * Attribute an inbound provider event/poll back to a profile by its session
   * or applicant id. Scoped to the provider so refs can never collide across
   * vendors.
   */
  findProfileByProviderRef(
    provider: string,
    ref: string,
  ): Promise<KycProfile | null> {
    return prisma.kycProfile.findFirst({
      where: {
        provider,
        OR: [{ providerSessionId: ref }, { providerApplicantId: ref }],
      },
    });
  },

  /**
   * Create/replace the user's KYC profile (one row per user) and move the user
   * into PENDING review — atomically.
   */
  submitProfile(
    userId: string,
    data: {
      fullName: string;
      dob: Date;
      panEnc: Buffer;
      aadhaarRefEnc: Buffer | null;
      panMasked: string | null;
      address?: Prisma.InputJsonValue;
      provider: string;
      providerSessionId: string;
      providerApplicantId: string | null;
    },
  ): Promise<KycProfile> {
    const writable = {
      fullName: data.fullName,
      dob: data.dob,
      panEnc: data.panEnc,
      aadhaarRefEnc: data.aadhaarRefEnc,
      panMasked: data.panMasked,
      address: data.address,
      provider: data.provider,
      // `providerRef` retained for back-compat; mirrors the session id.
      providerRef: data.providerSessionId,
      providerSessionId: data.providerSessionId,
      providerApplicantId: data.providerApplicantId,
    };
    return prisma.$transaction(async (tx) => {
      const profile = await tx.kycProfile.upsert({
        where: { userId },
        update: {
          ...writable,
          status: 'PENDING',
          // A resubmission clears any prior review/provider outcome.
          rejectedReason: null,
          reviewedBy: null,
          reviewedAt: null,
          livenessStatus: null,
          documentStatus: null,
          riskScore: null,
          aadhaarMasked: null,
        },
        create: { userId, ...writable, status: 'PENDING' },
      });
      await tx.user.update({
        where: { id: userId },
        data: { kycStatus: 'PENDING' },
      });
      return profile;
    });
  },

  createDocument(data: {
    userId: string;
    docType: KycDocType;
    storageKey: string;
    sha256: string;
  }): Promise<KycDocument> {
    return prisma.kycDocument.create({ data });
  },

  listDocumentsByUser(userId: string): Promise<KycDocument[]> {
    return prisma.kycDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Filtered, oldest-first page of KYC profiles for the admin review queue.
   * Defaults to PENDING (the FIFO review queue) when no status filter is given.
   * Fetches one extra row so the service can derive `nextCursor` cheaply.
   */
  listProfiles(input: {
    limit: number;
    cursor?: string;
    status?: KycStatus;
    email?: string;
    riskLevel?: User['riskLevel'];
    accountStatus?: User['status'];
    submittedFrom?: Date;
    submittedTo?: Date;
  }): Promise<AdminKycProfileRow[]> {
    const userFilter: Prisma.UserWhereInput = {
      ...(input.email ? { email: { contains: input.email, mode: 'insensitive' } } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.accountStatus ? { status: input.accountStatus } : {}),
    };
    const where: Prisma.KycProfileWhereInput = {
      status: input.status ?? 'PENDING',
      ...(Object.keys(userFilter).length ? { user: userFilter } : {}),
    };
    if (input.submittedFrom || input.submittedTo) {
      where.createdAt = {
        ...(input.submittedFrom ? { gte: input.submittedFrom } : {}),
        ...(input.submittedTo ? { lte: input.submittedTo } : {}),
      };
    }
    return prisma.kycProfile.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        user: { select: { email: true, kycTier: true, riskLevel: true, status: true } },
      },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
  },

  /** Full profile + user context + documents for the admin detail view. */
  findProfileDetail(userId: string) {
    return prisma.kycProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            kycTier: true,
            riskLevel: true,
            riskNote: true,
            status: true,
            withdrawalsBlocked: true,
          },
        },
      },
    });
  },

  /** Recent deposit/withdrawal activity summary for the KYC detail view. */
  async activitySummary(userId: string): Promise<{
    depositCount: number;
    withdrawalCount: number;
    lastDepositAt: Date | null;
    lastWithdrawalAt: Date | null;
  }> {
    const [depositCount, withdrawalCount, lastDeposit, lastWithdrawal] = await Promise.all([
      prisma.cryptoDeposit.count({ where: { userId } }),
      prisma.cryptoWithdrawal.count({ where: { userId } }),
      prisma.cryptoDeposit.findFirst({
        where: { userId },
        orderBy: { detectedAt: 'desc' },
        select: { detectedAt: true },
      }),
      prisma.cryptoWithdrawal.findFirst({
        where: { userId },
        orderBy: { requestedAt: 'desc' },
        select: { requestedAt: true },
      }),
    ]);
    return {
      depositCount,
      withdrawalCount,
      lastDepositAt: lastDeposit?.detectedAt ?? null,
      lastWithdrawalAt: lastWithdrawal?.requestedAt ?? null,
    };
  },

  /**
   * Apply a review decision atomically: update the profile, the user's
   * kycStatus (and tier on approval), and cascade the status to documents.
   */
  decide(
    userId: string,
    data: {
      status: KycStatus;
      userKycStatus: KycStatus;
      reviewedBy: string;
      reviewedAt: Date;
      rejectedReason: string | null;
      tier?: number;
      complianceNote?: string;
      cascadeDocuments?: boolean;
    },
  ): Promise<KycProfile> {
    return prisma.$transaction(async (tx) => {
      const profile = await tx.kycProfile.update({
        where: { userId },
        data: {
          status: data.status,
          reviewedBy: data.reviewedBy,
          reviewedAt: data.reviewedAt,
          rejectedReason: data.rejectedReason,
          ...(data.complianceNote !== undefined
            ? { complianceNote: data.complianceNote }
            : {}),
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          kycStatus: data.userKycStatus,
          ...(data.tier !== undefined ? { kycTier: data.tier } : {}),
        },
      });
      // Cascade the document status only on a terminal APPROVE/REJECT — a
      // request-for-more-info leaves the existing documents untouched.
      if (data.cascadeDocuments) {
        await tx.kycDocument.updateMany({
          where: { userId },
          data: { status: data.status },
        });
      }
      return profile;
    });
  },

  /** Set ONLY the internal compliance note (no status / gating change). */
  setComplianceNote(userId: string, note: string): Promise<KycProfile> {
    return prisma.kycProfile.update({
      where: { userId },
      data: { complianceNote: note },
    });
  },

  /**
   * Per-user KYC action timeline from admin_logs (admin decisions/notes),
   * newest first, with the acting admin's email resolved for display.
   */
  kycTimeline(userId: string) {
    return prisma.adminLog.findMany({
      where: { targetType: 'kyc_profile', targetId: userId },
      orderBy: { occurredAt: 'desc' },
      take: 25,
      include: { admin: { select: { email: true } } },
    });
  },

  /** Most-recent KYC admin actions across all users (compliance dashboard). */
  recentKycActions(limit: number) {
    return prisma.adminLog.findMany({
      where: {
        targetType: 'kyc_profile',
        action: { in: ['kyc.approve', 'kyc.reject', 'kyc.request_info', 'kyc.note'] },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: { admin: { select: { email: true } } },
    });
  },

  /** Count of KYC profiles grouped by status. */
  countByStatus() {
    return prisma.kycProfile.groupBy({ by: ['status'], _count: { _all: true } });
  },

  /** Profiles still PENDING that were submitted before `before`. */
  countPendingOlderThan(before: Date): Promise<number> {
    return prisma.kycProfile.count({
      where: { status: 'PENDING', createdAt: { lt: before } },
    });
  },

  /** Active, non-deleted users flagged HIGH risk. */
  countHighRiskUsers(): Promise<number> {
    return prisma.user.count({ where: { riskLevel: 'HIGH', deletedAt: null } });
  },

  /**
   * Apply a provider-driven (webhook/poll) verification result atomically:
   * update the profile's normalized outcome + status, mirror the user's
   * kycStatus (and tier only on APPROVED). The status transition itself is
   * validated by the service before this runs.
   */
  applyProviderUpdate(
    userId: string,
    data: {
      status: KycStatus;
      livenessStatus: KycCheckStatus | null;
      documentStatus: KycCheckStatus | null;
      riskScore: number | null;
      panMasked: string | null;
      aadhaarMasked: string | null;
      rejectedReason: string | null;
      tier?: number;
      changeStatus: boolean;
    },
  ): Promise<KycProfile> {
    return prisma.$transaction(async (tx) => {
      const profile = await tx.kycProfile.update({
        where: { userId },
        data: {
          ...(data.changeStatus ? { status: data.status } : {}),
          livenessStatus: data.livenessStatus,
          documentStatus: data.documentStatus,
          riskScore: data.riskScore,
          ...(data.panMasked !== null ? { panMasked: data.panMasked } : {}),
          ...(data.aadhaarMasked !== null
            ? { aadhaarMasked: data.aadhaarMasked }
            : {}),
          rejectedReason: data.rejectedReason,
        },
      });
      if (data.changeStatus) {
        await tx.user.update({
          where: { id: userId },
          data: {
            kycStatus: data.status,
            ...(data.tier !== undefined ? { kycTier: data.tier } : {}),
          },
        });
      }
      return profile;
    });
  },

  // ----------------------------------------------------------------------
  // Webhook idempotency (append-only kyc_webhook_events).
  // ----------------------------------------------------------------------
  findWebhookEvent(provider: string, providerEventId: string) {
    return prisma.kycWebhookEvent.findUnique({
      where: { provider_providerEventId: { provider, providerEventId } },
    });
  },

  createWebhookEvent(data: {
    provider: string;
    providerEventId: string;
    eventType: string;
    signatureOk: boolean;
    payload: Prisma.InputJsonValue;
  }) {
    return prisma.kycWebhookEvent.create({ data });
  },

  markWebhookProcessed(provider: string, providerEventId: string) {
    return prisma.kycWebhookEvent.update({
      where: { provider_providerEventId: { provider, providerEventId } },
      data: { processedAt: new Date() },
    });
  },

  /** Admin-side audit row (parallels the admin-rbac module's admin_logs use). */
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

export type KycRepository = typeof kycRepository;
