import type { Prisma } from '@prisma/client';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { encryptPII } from '../../lib/encryption';
import { notificationService } from '../notification/notification.service';
import { complianceRepository } from './compliance.repository';
import { getLivenessProvider } from './liveness';
import { scoreCustomerRisk, type RiskAdminFlag } from './compliance.risk';
import {
  CONSENT_VERSION,
  last4,
  maskAadhaar,
  maskPan,
  toAdminComplianceDto,
  toConsentDto,
  toEvidenceDto,
  toRiskAssessmentDto,
  toUserComplianceDto,
  type ComplianceContext,
  type GeoEvidence,
  type UserComplianceDto,
} from './compliance.types';
import type {
  ComplianceReviewDto,
  ComplianceRiskDto,
  LivenessVerifyDto,
  SubmitEnhancedKycDto,
} from './compliance.validators';

const DAY_MS = 24 * 60 * 60 * 1000;

function providerMode(): 'mock' | 'live' {
  return getLivenessProvider().mode;
}

function retentionUntil(from = new Date()): Date {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + config.compliance.recordRetentionYears);
  return d;
}

export const complianceService = {
  // ==================================================================
  // User: status
  // ==================================================================
  async getStatus(userId: string): Promise<UserComplianceDto | null> {
    const profile = await complianceRepository.findProfile(userId);
    return toUserComplianceDto(profile, providerMode());
  },

  // ==================================================================
  // User: liveness (mock provider abstraction)
  // ==================================================================
  async startLiveness(userId: string, ctx: ComplianceContext = {}) {
    const user = await complianceRepository.findUserBasic(userId);
    if (!user) throw new NotFoundError('User not found');

    const provider = getLivenessProvider();
    const session = await provider.createSession({ userId });

    // Ensure a (draft) profile exists and mark liveness pending.
    await complianceRepository.upsertProfile(
      userId,
      {
        userId,
        status: 'DRAFT',
        livenessStatus: 'PENDING',
        livenessProvider: session.provider,
        livenessReference: session.providerReference,
      },
      {
        livenessStatus: 'PENDING',
        livenessProvider: session.provider,
        livenessReference: session.providerReference,
      },
    );

    await complianceRepository.createEvidence({
      userId,
      type: 'LIVENESS',
      status: 'PENDING',
      provider: session.provider,
      referenceId: session.providerReference,
      metadata: { mode: session.mode, event: 'session_created' },
    });

    await this.audit(ctx, userId, 'compliance.liveness.start', {
      provider: session.provider,
      mode: session.mode,
    });

    return {
      provider: session.provider,
      mode: session.mode,
      providerReference: session.providerReference,
      sessionId: session.sessionId,
      status: session.status,
      captureUrl: session.captureUrl,
      expiresInSec: session.expiresInSec,
    };
  },

  async verifyLiveness(userId: string, input: LivenessVerifyDto, ctx: ComplianceContext = {}) {
    const profile = await complianceRepository.findProfile(userId);
    if (!profile) throw new NotFoundError('No compliance profile; start liveness first');

    const provider = getLivenessProvider();
    const result = await provider.verifySession({
      userId,
      providerReference: input.providerReference,
      sessionId: input.sessionId,
      simulateOutcome: input.simulateOutcome,
    });

    const livenessStatus = result.status; // PASSED | FAILED | REVIEW_REQUIRED
    await complianceRepository.updateProfile(userId, {
      livenessStatus,
      livenessProvider: result.provider,
      livenessReference: result.providerReference,
      livenessScore: Math.round(result.confidence * 100),
    });

    await complianceRepository.createEvidence({
      userId,
      type: 'LIVENESS',
      status: livenessStatus === 'PASSED' ? 'VERIFIED' : livenessStatus === 'FAILED' ? 'REJECTED' : 'INFO',
      provider: result.provider,
      referenceId: result.providerReference,
      // Confidence only — never any biometric frame or raw vendor payload.
      metadata: { mode: result.mode, status: livenessStatus, confidence: result.confidence },
    });

    await this.recomputeRisk(userId, 'KYC');

    if (livenessStatus === 'FAILED') {
      await this.safeNotify({ userId, type: 'KYC_LIVENESS_FAILED' });
    }

    await this.audit(ctx, userId, 'compliance.liveness.verify', {
      provider: result.provider,
      mode: result.mode,
      status: livenessStatus,
    });

    return {
      provider: result.provider,
      mode: result.mode,
      status: livenessStatus,
      confidence: result.confidence,
    };
  },

  // ==================================================================
  // User: enhanced KYC submission
  // ==================================================================
  async submitEnhanced(
    userId: string,
    input: SubmitEnhancedKycDto,
    geo: GeoEvidence,
    ctx: ComplianceContext = {},
  ): Promise<UserComplianceDto> {
    const user = await complianceRepository.findUserBasic(userId);
    if (!user) throw new NotFoundError('User not found');

    const existing = await complianceRepository.findProfile(userId);
    if (existing && existing.status === 'APPROVED') {
      throw new ConflictError('Compliance KYC is already approved', 'COMPLIANCE_ALREADY_APPROVED');
    }
    if (existing && existing.status === 'UNDER_REVIEW') {
      throw new ConflictError('Compliance KYC is already under review', 'COMPLIANCE_IN_REVIEW');
    }

    // Mock AML/CFT screening (clearly marked). A real integration replaces this.
    const screening = this.runMockScreening();

    const create: Prisma.ComplianceProfileUncheckedCreateInput = {
      userId,
      customerType: input.customerType,
      status: 'SUBMITTED',
      fullName: input.fullName,
      dateOfBirth: new Date(input.dateOfBirth),
      nationality: input.nationality,
      countryOfResidence: input.countryOfResidence,
      addressLine1: input.address.line1,
      addressLine2: input.address.line2 ?? null,
      city: input.address.city,
      state: input.address.state,
      postalCode: input.address.postalCode,
      country: input.address.country,
      // Masked + encrypted; raw values are never stored or returned.
      panMasked: maskPan(input.pan),
      panLast4: last4(input.pan),
      panEnc: encryptPII(input.pan),
      aadhaarMasked: input.aadhaar ? maskAadhaar(input.aadhaar) : null,
      aadhaarLast4: input.aadhaar ? last4(input.aadhaar) : null,
      aadhaarRefEnc: input.aadhaar ? encryptPII(input.aadhaar) : null,
      onboardingIp: geo.ip,
      onboardingCountry: geo.country,
      onboardingRegion: geo.region,
      onboardingCity: geo.city,
      onboardingLatitude: geo.latitude,
      onboardingLongitude: geo.longitude,
      onboardingUserAgent: geo.userAgent,
      geoCaptureStatus: geo.status,
      sanctionsStatus: screening.sanctions,
      pepStatus: screening.pep,
      adverseMediaStatus: screening.adverseMedia,
      consentVersion: CONSENT_VERSION,
      kycProvider: getLivenessProvider().name,
      retentionUntil: retentionUntil(),
    };
    const { userId: _omit, ...update } = create;

    const profile = await complianceRepository.upsertProfile(userId, create, update as Prisma.ComplianceProfileUncheckedUpdateInput);

    // Consent records (immutable audit trail).
    await complianceRepository.createConsents([
      { userId, consentType: 'KYC_PROCESSING', version: CONSENT_VERSION, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
      { userId, consentType: 'AML_SCREENING', version: CONSENT_VERSION, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
      { userId, consentType: 'DATA_RETENTION', version: CONSENT_VERSION, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
      { userId, consentType: 'TERMS_ACCEPTANCE', version: CONSENT_VERSION, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
      { userId, consentType: 'RISK_DISCLOSURE', version: CONSENT_VERSION, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
    ]);

    // Evidence rows — locators + redacted metadata only.
    const evidence: Prisma.ComplianceEvidenceUncheckedCreateInput[] = [
      { userId, type: 'PAN', status: 'PENDING', metadata: { masked: profile.panMasked } },
      { userId, type: 'ADDRESS', status: 'PENDING', metadata: { country: input.address.country, city: input.address.city } },
      { userId, type: 'GEOLOCATION', status: 'INFO', metadata: { country: geo.country, region: geo.region, city: geo.city, status: geo.status } },
      { userId, type: 'DEVICE', status: 'INFO', metadata: { userAgent: geo.userAgent, ip: geo.ip } },
      { userId, type: 'CONSENT', status: 'VERIFIED', metadata: { version: CONSENT_VERSION, count: 5 } },
    ];
    if (input.aadhaar) {
      evidence.push({ userId, type: 'AADHAAR', status: 'PENDING', metadata: { masked: profile.aadhaarMasked } });
    }
    for (const e of evidence) await complianceRepository.createEvidence(e);

    // Risk scoring (source = KYC).
    await this.recomputeRisk(userId, 'KYC');

    await this.audit(ctx, userId, 'compliance.submit', {
      customerType: input.customerType,
      hasAadhaar: Boolean(input.aadhaar),
      geoCaptureStatus: geo.status,
      country: input.countryOfResidence,
    });

    await this.safeNotify({ userId, type: 'KYC_SUBMITTED' });

    const fresh = await complianceRepository.findProfile(userId);
    return toUserComplianceDto(fresh, providerMode())!;
  },

  /** Deterministic mock screening — clearly marked; replace with a real vendor. */
  runMockScreening() {
    return { sanctions: 'CLEAR', pep: 'CLEAR', adverseMedia: 'CLEAR' } as const;
  },

  // ==================================================================
  // Risk scoring
  // ==================================================================
  async recomputeRisk(
    userId: string,
    source: 'KYC' | 'TRANSACTION' | 'ADMIN' | 'SCREENING' | 'SYSTEM',
    opts: { adminFlag?: RiskAdminFlag; createdByAdminId?: string } = {},
  ) {
    const profile = await complianceRepository.findProfile(userId);
    if (!profile) throw new NotFoundError('Compliance profile not found');
    const rejectionCount = await complianceRepository.countRejections(userId);

    const result = scoreCustomerRisk(
      {
        countryOfResidence: profile.countryOfResidence,
        nationality: profile.nationality,
        hasPan: Boolean(profile.panLast4),
        hasAadhaar: Boolean(profile.aadhaarLast4),
        livenessStatus: profile.livenessStatus,
        sanctionsStatus: profile.sanctionsStatus,
        pepStatus: profile.pepStatus,
        adverseMediaStatus: profile.adverseMediaStatus,
        rejectionCount,
        adminFlag: opts.adminFlag ?? 'NONE',
        geoCaptured: profile.geoCaptureStatus === 'CAPTURED' || profile.geoCaptureStatus === 'PARTIAL',
      },
      {
        requireLiveness: config.compliance.requireLiveness,
        requireSanctionsBeforeApproval: config.compliance.requireSanctionsBeforeApproval,
        defaultRiskLevel: config.compliance.defaultRiskLevel,
      },
    );

    await complianceRepository.updateProfile(userId, {
      riskLevel: result.level,
      riskScore: result.score,
      riskReason: result.reasons.map((r) => r.code).join(', ') || null,
    });

    await complianceRepository.createRiskAssessment({
      userId,
      score: result.score,
      level: result.level,
      reasons: result.reasons as unknown as Prisma.InputJsonValue,
      source,
      createdByAdminId: opts.createdByAdminId ?? null,
    });

    return result;
  },

  // ==================================================================
  // Admin
  // ==================================================================
  async listUsers(
    input: { status?: any; riskLevel?: any; email?: string; cursor?: string; limit: number },
    ctx: ComplianceContext = {},
  ) {
    const rows = await complianceRepository.listProfiles(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    await this.audit(ctx, undefined, 'compliance.admin.queue_view', { count: page.length });
    return {
      items: page.map((p) => ({
        userId: p.userId,
        email: p.user.email,
        status: p.status,
        riskLevel: p.riskLevel,
        riskScore: p.riskScore,
        livenessStatus: p.livenessStatus,
        sanctionsStatus: p.sanctionsStatus,
        countryOfResidence: p.countryOfResidence,
        customerType: p.customerType,
        submittedAt: p.createdAt,
        lastReviewedAt: p.lastReviewedAt,
        nextReviewDueAt: p.nextReviewDueAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  async getDetail(userId: string, ctx: ComplianceContext = {}) {
    const profile = await complianceRepository.findProfileWithUser(userId);
    if (!profile) throw new NotFoundError('Compliance profile not found');
    const [evidence, consents, assessments] = await Promise.all([
      complianceRepository.listEvidence(userId),
      complianceRepository.listConsents(userId),
      complianceRepository.listRiskAssessments(userId),
    ]);
    await this.audit(ctx, userId, 'compliance.admin.detail_view', {});
    return {
      profile: toAdminComplianceDto(profile),
      evidence: evidence.map(toEvidenceDto),
      consents: consents.map(toConsentDto),
      riskAssessments: assessments.map(toRiskAssessmentDto),
      providerMode: providerMode(),
    };
  },

  async getEvidence(userId: string, ctx: ComplianceContext = {}) {
    const profile = await complianceRepository.findProfile(userId);
    if (!profile) throw new NotFoundError('Compliance profile not found');
    const [evidence, consents] = await Promise.all([
      complianceRepository.listEvidence(userId),
      complianceRepository.listConsents(userId),
    ]);
    await this.audit(ctx, userId, 'compliance.admin.evidence_view', {});
    return { evidence: evidence.map(toEvidenceDto), consents: consents.map(toConsentDto) };
  },

  async review(userId: string, input: ComplianceReviewDto, ctx: ComplianceContext = {}) {
    const profile = await complianceRepository.findProfile(userId);
    if (!profile) throw new NotFoundError('Compliance profile not found');

    const now = new Date();
    const reviewedByAdminId = ctx.actorId ?? null;

    if (input.decision === 'APPROVE') {
      if (
        config.compliance.requireSanctionsBeforeApproval &&
        profile.sanctionsStatus === 'NOT_SCREENED'
      ) {
        throw new BadRequestError(
          'Sanctions screening is required before approval',
          { code: 'SANCTIONS_REQUIRED' },
        );
      }
      const nextReviewDueAt = new Date(
        now.getTime() + (input.nextReviewInDays ?? 365) * DAY_MS,
      );
      await complianceRepository.updateProfile(userId, {
        status: 'APPROVED',
        verifiedAt: now,
        lastReviewedAt: now,
        nextReviewDueAt,
        reviewedByAdminId,
        ...(input.complianceNote ? { complianceNote: input.complianceNote } : {}),
      });
      // Sync legacy gating fields so downstream tier checks unlock.
      await this.syncLegacyKyc(userId, 'APPROVED');
      await this.auditAdmin(ctx, userId, 'compliance.review.approve', {
        afterState: { status: 'APPROVED' },
      });
      await this.safeNotify({ userId, type: 'KYC_APPROVED' });
      await this.safeNotify({ userId, type: 'COMPLIANCE_REVIEW_COMPLETED', metadata: { outcome: 'APPROVED' } });
      return this.getDetail(userId, ctx);
    }

    if (input.decision === 'REQUEST_INFO') {
      const reason = input.reason ?? 'Additional information required';
      await complianceRepository.updateProfile(userId, {
        status: 'NEEDS_MORE_INFO',
        lastReviewedAt: now,
        reviewedByAdminId,
        riskReason: reason,
        ...(input.complianceNote ? { complianceNote: input.complianceNote } : {}),
      });
      await this.syncLegacyKyc(userId, 'NEEDS_MORE_INFO');
      await this.auditAdmin(ctx, userId, 'compliance.review.request_info', {
        reason,
        afterState: { status: 'NEEDS_MORE_INFO' },
      });
      await this.safeNotify({ userId, type: 'KYC_NEEDS_MORE_INFO', metadata: { reason } });
      return this.getDetail(userId, ctx);
    }

    // REJECT
    const reason = input.reason ?? 'Rejected';
    await complianceRepository.updateProfile(userId, {
      status: 'REJECTED',
      lastReviewedAt: now,
      reviewedByAdminId,
      riskReason: reason,
      ...(input.complianceNote ? { complianceNote: input.complianceNote } : {}),
    });
    await this.syncLegacyKyc(userId, 'REJECTED');
    // Record an ADMIN-sourced rejection so the repeated-rejection rule can see it.
    await complianceRepository.createRiskAssessment({
      userId,
      score: profile.riskScore,
      level: profile.riskLevel,
      reasons: [{ code: 'KYC_REJECTED', message: reason, weight: 0 }] as unknown as Prisma.InputJsonValue,
      source: 'ADMIN',
      createdByAdminId: reviewedByAdminId,
    });
    await this.auditAdmin(ctx, userId, 'compliance.review.reject', {
      reason,
      afterState: { status: 'REJECTED' },
    });
    await this.safeNotify({ userId, type: 'KYC_REJECTED', metadata: { reason } });
    await this.safeNotify({ userId, type: 'COMPLIANCE_REVIEW_COMPLETED', metadata: { outcome: 'REJECTED' } });
    return this.getDetail(userId, ctx);
  },

  async setRisk(userId: string, input: ComplianceRiskDto, ctx: ComplianceContext = {}) {
    const profile = await complianceRepository.findProfile(userId);
    if (!profile) throw new NotFoundError('Compliance profile not found');
    const score = input.score ?? profile.riskScore;
    await complianceRepository.updateProfile(userId, {
      riskLevel: input.level,
      riskScore: score,
      riskReason: input.reason ?? profile.riskReason,
    });
    await complianceRepository.createRiskAssessment({
      userId,
      score,
      level: input.level,
      reasons: [{ code: 'ADMIN_OVERRIDE', message: input.reason ?? 'Manual risk override', weight: 0 }] as unknown as Prisma.InputJsonValue,
      source: 'ADMIN',
      createdByAdminId: ctx.actorId ?? null,
    });
    await this.auditAdmin(ctx, userId, 'compliance.risk.set', {
      afterState: { level: input.level, score },
    });
    return this.getDetail(userId, ctx);
  },

  /** Build a secrets-free compliance evidence summary for export (JSON/CSV). */
  async exportSummary(userId: string, ctx: ComplianceContext = {}) {
    const detail = await this.getDetail(userId, ctx);
    await this.auditAdmin(ctx, userId, 'compliance.export', {});
    return {
      generatedAt: new Date().toISOString(),
      disclaimer:
        'Technical compliance evidence export. Screening/liveness values may be mock in staging. Not a legal compliance attestation.',
      ...detail,
    };
  },

  /**
   * Record-retention audit placeholder (Scope I). Reports how many compliance
   * profiles are past their retentionUntil. It NEVER deletes anything.
   */
  async retentionAudit() {
    const now = new Date();
    return {
      policyYears: config.compliance.recordRetentionYears,
      checkedAt: now.toISOString(),
      note: 'Retention audit is report-only; compliance records are never auto-deleted.',
    };
  },

  // ==================================================================
  // Helpers
  // ==================================================================

  /** Mirror a terminal compliance decision onto the legacy KYC gating fields. */
  async syncLegacyKyc(userId: string, status: 'APPROVED' | 'REJECTED' | 'NEEDS_MORE_INFO') {
    try {
      const data: Prisma.UserUncheckedUpdateInput =
        status === 'APPROVED'
          ? { kycStatus: 'APPROVED', kycTier: config.kyc.defaultApprovedTier }
          : { kycStatus: status };
      await prisma.user.update({ where: { id: userId }, data });
    } catch (err) {
      logger.warn({ err, userId, status }, 'compliance: legacy KYC sync failed (non-fatal)');
    }
  },

  /**
   * Fire a notification but NEVER let a mail/notification failure break the
   * core compliance action (Scope H). notificationService.notify is already
   * fail-safe; this is defence in depth.
   */
  async safeNotify(input: Parameters<typeof notificationService.notify>[0]) {
    try {
      await notificationService.notify(input);
    } catch (err) {
      logger.warn({ err, type: input.type }, 'compliance: notification failed (non-fatal)');
    }
  },

  async audit(
    ctx: ComplianceContext,
    userId: string | undefined,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await recordAudit({
      actorType: ctx.actorId ? 'USER' : 'SYSTEM',
      actorId: ctx.actorId,
      action,
      entityType: 'compliance_profile',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: metadata as Prisma.InputJsonValue,
    });
  },

  async auditAdmin(
    ctx: ComplianceContext,
    userId: string,
    action: string,
    input: { reason?: string; beforeState?: Prisma.InputJsonValue; afterState?: Prisma.InputJsonValue },
  ) {
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action,
      entityType: 'compliance_profile',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: input.afterState,
    });
    if (ctx.actorId) {
      await complianceRepository.writeAdminLog({
        adminId: ctx.actorId,
        action,
        targetType: 'compliance_profile',
        targetId: userId,
        reason: input.reason,
        beforeState: input.beforeState,
        afterState: input.afterState,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
  },
};

export type ComplianceService = typeof complianceService;
