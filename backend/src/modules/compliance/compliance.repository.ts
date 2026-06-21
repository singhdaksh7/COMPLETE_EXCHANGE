import {
  Prisma,
  type ComplianceConsent,
  type ComplianceEvidence,
  type ComplianceKycStatus,
  type ComplianceProfile,
  type ComplianceRiskLevel,
  type RiskAssessment,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the compliance layer — the ONLY place that talks to Prisma for
 * compliance_profiles / compliance_evidence / compliance_consents /
 * risk_assessments. Read/write of existing tables is limited to the additive
 * compliance columns; it never touches ledger, trading, or withdrawal state.
 */

const USER_SELECT = {
  select: { email: true, status: true, kycStatus: true, kycTier: true },
} as const;

export type ComplianceProfileWithUser = ComplianceProfile & {
  user: { email: string; status: string; kycStatus: string; kycTier: number };
};

export const complianceRepository = {
  findUserBasic(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, kycStatus: true, kycTier: true, riskLevel: true },
    });
  },

  findProfile(userId: string): Promise<ComplianceProfile | null> {
    return prisma.complianceProfile.findUnique({ where: { userId } });
  },

  findProfileWithUser(userId: string): Promise<ComplianceProfileWithUser | null> {
    return prisma.complianceProfile.findUnique({
      where: { userId },
      include: { user: USER_SELECT },
    }) as Promise<ComplianceProfileWithUser | null>;
  },

  upsertProfile(
    userId: string,
    create: Prisma.ComplianceProfileUncheckedCreateInput,
    update: Prisma.ComplianceProfileUncheckedUpdateInput,
  ): Promise<ComplianceProfile> {
    return prisma.complianceProfile.upsert({
      where: { userId },
      create: { ...create, userId },
      update,
    });
  },

  updateProfile(
    userId: string,
    data: Prisma.ComplianceProfileUncheckedUpdateInput,
  ): Promise<ComplianceProfile> {
    return prisma.complianceProfile.update({ where: { userId }, data });
  },

  async listProfiles(input: {
    limit: number;
    cursor?: string;
    status?: ComplianceKycStatus;
    riskLevel?: ComplianceRiskLevel;
    email?: string;
  }): Promise<ComplianceProfileWithUser[]> {
    return prisma.complianceProfile.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
        ...(input.email
          ? { user: { email: { contains: input.email, mode: 'insensitive' } } }
          : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      include: { user: USER_SELECT },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    }) as Promise<ComplianceProfileWithUser[]>;
  },

  // ----- evidence -----
  createEvidence(
    data: Prisma.ComplianceEvidenceUncheckedCreateInput,
  ): Promise<ComplianceEvidence> {
    return prisma.complianceEvidence.create({ data });
  },

  listEvidence(userId: string): Promise<ComplianceEvidence[]> {
    return prisma.complianceEvidence.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ----- consents -----
  createConsents(
    rows: Prisma.ComplianceConsentUncheckedCreateInput[],
  ): Promise<Prisma.BatchPayload> {
    return prisma.complianceConsent.createMany({ data: rows });
  },

  listConsents(userId: string): Promise<ComplianceConsent[]> {
    return prisma.complianceConsent.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
    });
  },

  // ----- risk assessments -----
  createRiskAssessment(
    data: Prisma.RiskAssessmentUncheckedCreateInput,
  ): Promise<RiskAssessment> {
    return prisma.riskAssessment.create({ data });
  },

  listRiskAssessments(userId: string): Promise<RiskAssessment[]> {
    return prisma.riskAssessment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  /** Count prior compliance rejections (drives the repeated-rejection rule). */
  async countRejections(userId: string): Promise<number> {
    const rows = await prisma.riskAssessment.findMany({
      where: { userId, source: 'ADMIN' },
      select: { reasons: true },
    });
    return rows.filter((r) => {
      const reasons = r.reasons as Array<{ code?: string }> | null;
      return Array.isArray(reasons) && reasons.some((x) => x?.code === 'KYC_REJECTED');
    }).length;
  },

  // ----- admin log (mirrors other admin modules) -----
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

export type ComplianceRepository = typeof complianceRepository;
