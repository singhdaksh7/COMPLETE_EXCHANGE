import type {
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
      address?: Prisma.InputJsonValue;
      provider: string;
      providerRef: string;
    },
  ): Promise<KycProfile> {
    const writable = {
      fullName: data.fullName,
      dob: data.dob,
      panEnc: data.panEnc,
      aadhaarRefEnc: data.aadhaarRefEnc,
      address: data.address,
      provider: data.provider,
      providerRef: data.providerRef,
    };
    return prisma.$transaction(async (tx) => {
      const profile = await tx.kycProfile.upsert({
        where: { userId },
        update: {
          ...writable,
          status: 'PENDING',
          // A resubmission clears any prior review outcome.
          rejectedReason: null,
          reviewedBy: null,
          reviewedAt: null,
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
