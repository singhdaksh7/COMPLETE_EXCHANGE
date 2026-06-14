import { randomUUID } from 'node:crypto';
import type { KycDocType, Prisma } from '@prisma/client';
import { config } from '../../config';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { encryptPII } from '../../lib/encryption';
import { kycRepository } from './kyc.repository';
import { getDigiLockerProvider } from './providers';
import {
  KycAction,
  toAdminKycQueueItem,
  toKycDocumentDto,
  toKycProfileDto,
} from './kyc.types';
import type {
  KycContext,
  KycDecisionInput,
  KycDocumentDto,
  KycDocumentUploadDto,
  KycProfileDto,
  KycQueueResult,
  KycSubmitResult,
  SubmitDocumentInput,
  SubmitProfileInput,
} from './kyc.types';

/**
 * Build a secure, namespaced object-storage key. We persist ONLY this key; the
 * presigned upload URL derived from it is returned to the client and never
 * stored, so a leaked DB row exposes no fetchable document URL.
 */
function buildStorageKey(userId: string, docType: KycDocType): string {
  return `kyc/${userId}/${docType.toLowerCase()}/${randomUUID()}`;
}

/**
 * STUB presigned upload URL. A real implementation returns a short-lived signed
 * PUT URL from object storage (S3/GCS). The host is non-routable so it can never
 * accidentally hit a real bucket.
 */
function buildStubUploadUrl(
  storageKey: string,
  contentType: string,
  ttlSec: number,
): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const params = new URLSearchParams({ contentType, expires: String(expires) });
  return `https://kyc-storage.mock.local/${storageKey}?${params.toString()}`;
}

/**
 * Service layer: all KYC business logic and orchestration.
 *
 * It depends on the repository for persistence, the encryption lib to seal PII,
 * and the DigiLocker provider abstraction — never on Express types. Sensitive
 * inputs (PAN, Aadhaar ref) are encrypted before persistence and are NEVER
 * written to logs or audit metadata.
 */
export const kycService = {
  // ------------------------------------------------------------------
  // User: status
  // ------------------------------------------------------------------
  async getStatus(userId: string): Promise<KycProfileDto> {
    const user = await kycRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    const profile = await kycRepository.findProfileByUserId(userId);
    return toKycProfileDto(profile, user.kycTier, user.kycStatus);
  },

  // ------------------------------------------------------------------
  // User: profile submission
  // ------------------------------------------------------------------
  async submitProfile(
    userId: string,
    input: SubmitProfileInput,
    ctx: KycContext = {},
  ): Promise<KycSubmitResult> {
    const user = await kycRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.kycStatus === 'APPROVED') {
      throw new ConflictError('KYC is already approved', 'KYC_ALREADY_APPROVED');
    }

    const existing = await kycRepository.findProfileByUserId(userId);
    if (existing && existing.status === 'PENDING') {
      throw new ConflictError('KYC is already under review', 'KYC_IN_REVIEW');
    }

    // Begin a DigiLocker consent session (mock today). The opaque reference is
    // persisted so a later document pull can be attributed to this submission.
    const provider = getDigiLockerProvider();
    const session = await provider.createSession({ userId });

    const profile = await kycRepository.submitProfile(userId, {
      fullName: input.fullName,
      dob: new Date(input.dob),
      panEnc: encryptPII(input.pan),
      aadhaarRefEnc: input.aadhaarRef ? encryptPII(input.aadhaarRef) : null,
      address: input.address as Prisma.InputJsonValue | undefined,
      provider: session.provider,
      providerRef: session.providerRef,
    });

    // Audit WITHOUT any PII — only non-sensitive shape of the submission.
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: KycAction.PROFILE_SUBMIT,
      entityType: 'kyc_profile',
      entityId: profile.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        provider: session.provider,
        hasAadhaarRef: Boolean(input.aadhaarRef),
        hasAddress: Boolean(input.address),
      },
    });

    return {
      profile: toKycProfileDto(profile, user.kycTier, profile.status),
      digilocker: {
        authorizationUrl: session.authorizationUrl,
        expiresIn: session.expiresIn,
      },
    };
  },

  // ------------------------------------------------------------------
  // User: document metadata submission
  // ------------------------------------------------------------------
  async submitDocument(
    userId: string,
    input: SubmitDocumentInput,
    ctx: KycContext = {},
  ): Promise<KycDocumentUploadDto> {
    const user = await kycRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');

    const storageKey = buildStorageKey(userId, input.docType);
    const doc = await kycRepository.createDocument({
      userId,
      docType: input.docType,
      storageKey,
      sha256: input.sha256,
    });

    const uploadUrl = buildStubUploadUrl(
      storageKey,
      input.contentType,
      config.kyc.uploadUrlTtlSec,
    );

    // sha256 + docType are non-sensitive; the storage key is intentionally NOT
    // audited (it is an internal locator).
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: KycAction.DOCUMENT_SUBMIT,
      entityType: 'kyc_document',
      entityId: doc.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { docType: input.docType, sha256: input.sha256 },
    });

    return {
      documentId: doc.id,
      uploadUrl,
      expiresIn: config.kyc.uploadUrlTtlSec,
    };
  },

  async listDocuments(userId: string): Promise<KycDocumentDto[]> {
    const docs = await kycRepository.listDocumentsByUser(userId);
    return docs.map(toKycDocumentDto);
  },

  // ------------------------------------------------------------------
  // Admin: review queue
  // ------------------------------------------------------------------
  async reviewQueue(
    input: { cursor?: string; limit: number },
    ctx: KycContext = {},
  ): Promise<KycQueueResult> {
    const rows = await kycRepository.listPendingProfiles(input.limit, input.cursor);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    await this.auditAdmin(ctx, {
      action: KycAction.QUEUE_VIEW,
      targetType: 'kyc_queue',
      afterState: { count: page.length },
    });

    return {
      items: page.map(toAdminKycQueueItem),
      nextCursor,
    };
  },

  // ------------------------------------------------------------------
  // Admin: approve / reject decision (with tier assignment)
  // ------------------------------------------------------------------
  async decide(
    userId: string,
    input: KycDecisionInput,
    ctx: KycContext = {},
  ): Promise<KycProfileDto> {
    const profile = await kycRepository.findProfileByUserId(userId);
    if (!profile) throw new NotFoundError('KYC profile not found');
    const user = await kycRepository.findUserById(userId);
    const beforeTier = user?.kycTier ?? 0;
    const reviewedBy = ctx.actorId ?? '';

    if (input.decision === 'APPROVE') {
      const tier = input.tier ?? config.kyc.defaultApprovedTier;
      const updated = await kycRepository.decide(userId, {
        status: 'APPROVED',
        userKycStatus: 'APPROVED',
        reviewedBy,
        reviewedAt: new Date(),
        rejectedReason: null,
        tier,
      });
      await this.auditAdmin(ctx, {
        action: KycAction.APPROVE,
        targetType: 'kyc_profile',
        targetId: userId,
        beforeState: { status: profile.status, tier: beforeTier },
        afterState: { status: 'APPROVED', tier },
      });
      return toKycProfileDto(updated, tier, 'APPROVED');
    }

    // REJECT — reason is guaranteed present by the validator.
    const reason = input.reason ?? 'Rejected';
    const updated = await kycRepository.decide(userId, {
      status: 'REJECTED',
      userKycStatus: 'REJECTED',
      reviewedBy,
      reviewedAt: new Date(),
      rejectedReason: reason,
    });
    await this.auditAdmin(ctx, {
      action: KycAction.REJECT,
      targetType: 'kyc_profile',
      targetId: userId,
      reason,
      beforeState: { status: profile.status, tier: beforeTier },
      afterState: { status: 'REJECTED', tier: beforeTier },
    });
    return toKycProfileDto(updated, beforeTier, 'REJECTED');
  },

  // ------------------------------------------------------------------
  // Audit helpers (admin actions land in BOTH the hash-chained audit_logs
  // and the admin_logs trail, mirroring the admin-rbac module's convention).
  // ------------------------------------------------------------------
  async auditAdmin(
    ctx: KycContext,
    input: {
      action: string;
      targetType?: string;
      targetId?: string;
      reason?: string;
      beforeState?: Prisma.InputJsonValue;
      afterState?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: input.action,
      entityType: input.targetType,
      entityId: input.targetId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: input.afterState,
    });
    if (ctx.actorId) {
      await kycRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        beforeState: input.beforeState,
        afterState: input.afterState,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
  },
};

export type KycService = typeof kycService;
