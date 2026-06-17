import type {
  KycCheckStatus,
  KycDocType,
  KycDocument,
  KycProfile,
  KycStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

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
   * Oldest-first page of profiles awaiting review (FIFO queue). Fetches one
   * extra row so the service can derive `nextCursor` without a second query.
   */
  listPendingProfiles(limit: number, cursor?: string) {
    return prisma.kycProfile.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { user: { select: { email: true, kycTier: true } } },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
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
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          kycStatus: data.userKycStatus,
          ...(data.tier !== undefined ? { kycTier: data.tier } : {}),
        },
      });
      await tx.kycDocument.updateMany({
        where: { userId },
        data: { status: data.status },
      });
      return profile;
    });
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
