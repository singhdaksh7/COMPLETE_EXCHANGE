import { randomUUID } from 'node:crypto';
import type { KycDocType, KycProfile, Prisma } from '@prisma/client';
import { config } from '../../config';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { encryptPII } from '../../lib/encryption';
import { kycRepository } from './kyc.repository';
import { getKycProvider } from './providers';
import type { KycProviderResult, KycWebhookInput } from './providers';
import {
  assertTransition,
  mapProviderStatusToKyc,
  maskPan,
} from './kyc.status';
import {
  KycAction,
  toAdminKycQueueItem,
  toKycDocumentDto,
  toKycProfileDto,
  toKycSessionDto,
} from './kyc.types';
import type {
  KycContext,
  KycDecisionInput,
  KycDocumentDto,
  KycDocumentUploadDto,
  KycProfileDto,
  KycQueueResult,
  KycSubmitResult,
  KycWebhookResult,
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
 * the generic KYC provider abstraction (vendor-neutral), and the status machine
 * — never on Express types. Sensitive inputs (PAN, Aadhaar ref) are encrypted
 * before persistence and are NEVER written to logs or audit metadata.
 *
 * The status machine (`assertTransition`) is the single authority over the
 * gating fields (`user.kycStatus` / `user.kycTier`), so both the provider-driven
 * path and the admin manual fallback move state consistently.
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
  // User: profile submission (opens a provider verification session)
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
    if (existing && (existing.status === 'PENDING' || existing.status === 'IN_REVIEW')) {
      throw new ConflictError('KYC is already under review', 'KYC_IN_REVIEW');
    }

    // Begin a provider verification session (mock today). The opaque session +
    // applicant ids are persisted so later webhooks/polls can be attributed.
    const provider = getKycProvider();
    const session = await provider.createKycSession({ userId });

    const profile = await kycRepository.submitProfile(userId, {
      fullName: input.fullName,
      dob: new Date(input.dob),
      panEnc: encryptPII(input.pan),
      aadhaarRefEnc: input.aadhaarRef ? encryptPII(input.aadhaarRef) : null,
      panMasked: maskPan(input.pan),
      address: input.address as Prisma.InputJsonValue | undefined,
      provider: session.provider,
      providerSessionId: session.providerSessionId,
      providerApplicantId: session.providerApplicantId,
    });

    // Audit WITHOUT any PII — only the non-sensitive shape of the submission.
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
      session: toKycSessionDto(session),
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

    // Register the document with the provider (mock accepts + marks pending).
    const profile = await kycRepository.findProfileByUserId(userId);
    if (profile?.providerSessionId) {
      const provider = getKycProvider();
      await provider.submitDocuments({
        userId,
        providerSessionId: profile.providerSessionId,
        docType: input.docType,
        storageKey,
        sha256: input.sha256,
      });
    }

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
  // User: poll the provider for the latest result (webhook fallback)
  // ------------------------------------------------------------------
  async refreshStatus(userId: string, ctx: KycContext = {}): Promise<KycProfileDto> {
    const profile = await kycRepository.findProfileByUserId(userId);
    if (!profile || !profile.providerSessionId || !profile.provider) {
      throw new NotFoundError('No KYC session to refresh', 'KYC_NO_SESSION');
    }
    const provider = getKycProvider();
    const result = await provider.getStatus({
      providerSessionId: profile.providerSessionId,
      providerApplicantId: profile.providerApplicantId,
    });
    const updated = await this.applyProviderResult(profile, result, ctx, 'poll');
    const user = await kycRepository.findUserById(userId);
    return toKycProfileDto(updated, user?.kycTier ?? 0, updated.status);
  },

  // ------------------------------------------------------------------
  // Provider: inbound webhook (signature-verified, idempotent)
  // ------------------------------------------------------------------
  async handleWebhook(
    input: KycWebhookInput,
    ctx: KycContext = {},
  ): Promise<KycWebhookResult> {
    if (!input.rawBody) throw new BadRequestError('Missing webhook body');

    const provider = getKycProvider();
    const event = await provider.verifyWebhook(input);
    if (!event) {
      await recordAudit({
        actorType: 'SYSTEM',
        action: KycAction.WEBHOOK_INVALID_SIGNATURE,
        entityType: 'kyc_webhook_event',
        ip: ctx.ip,
        requestId: ctx.requestId,
        metadata: { provider: provider.name },
      });
      throw new BadRequestError('Invalid KYC webhook signature', {
        code: 'KYC_WEBHOOK_INVALID_SIGNATURE',
      });
    }

    // Idempotency: a redelivered event is recorded once and processed once.
    const existing = await kycRepository.findWebhookEvent(
      provider.name,
      event.providerEventId,
    );
    if (existing?.processedAt) {
      await recordAudit({
        actorType: 'SYSTEM',
        action: KycAction.WEBHOOK_DUPLICATE,
        entityType: 'kyc_webhook_event',
        entityId: existing.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
        metadata: { provider: provider.name, eventId: event.providerEventId },
      });
      return { status: 'duplicate' };
    }
    if (!existing) {
      await kycRepository.createWebhookEvent({
        provider: provider.name,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        signatureOk: true,
        payload: (input.body ?? {}) as Prisma.InputJsonValue,
      });
    }

    await recordAudit({
      actorType: 'SYSTEM',
      action: KycAction.WEBHOOK_RECEIVED,
      entityType: 'kyc_webhook_event',
      ip: ctx.ip,
      requestId: ctx.requestId,
      metadata: {
        provider: provider.name,
        eventId: event.providerEventId,
        eventType: event.eventType,
      },
    });

    // Attribute the event to a profile via its session/applicant id.
    const ref = event.providerApplicantId ?? event.providerSessionId;
    const profile = ref
      ? await kycRepository.findProfileByProviderRef(provider.name, ref)
      : null;
    if (!profile) {
      await kycRepository.markWebhookProcessed(provider.name, event.providerEventId);
      return { status: 'ignored' };
    }

    await this.applyProviderResult(profile, event.result, ctx, 'webhook');
    await kycRepository.markWebhookProcessed(provider.name, event.providerEventId);
    return { status: 'processed' };
  },

  /**
   * Apply a normalized provider result to a profile through the status machine.
   * Shared by the webhook and poll paths. Idempotent: when the target status
   * equals the current one, only the detail fields are refreshed (no status /
   * user change, no re-assert), so a redelivered terminal event is safe.
   */
  async applyProviderResult(
    profile: KycProfile,
    result: KycProviderResult,
    ctx: KycContext,
    source: 'webhook' | 'poll',
  ): Promise<KycProfile> {
    const target = mapProviderStatusToKyc(result.status);
    const changeStatus = profile.status !== target;
    if (changeStatus) assertTransition(profile.status, target);

    const tier =
      changeStatus && target === 'APPROVED'
        ? config.kyc.defaultApprovedTier
        : undefined;

    const updated = await kycRepository.applyProviderUpdate(profile.userId, {
      status: target,
      livenessStatus: result.livenessStatus,
      documentStatus: result.documentStatus,
      riskScore: result.riskScore,
      panMasked: result.panMasked,
      aadhaarMasked: result.aadhaarMasked,
      rejectedReason: target === 'REJECTED' ? result.rejectionReason : null,
      tier,
      changeStatus,
    });

    await recordAudit({
      actorType: 'SYSTEM',
      action: KycAction.PROVIDER_UPDATE,
      entityType: 'kyc_profile',
      entityId: profile.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
      metadata: {
        source,
        provider: profile.provider,
        from: profile.status,
        to: target,
        livenessStatus: result.livenessStatus,
        documentStatus: result.documentStatus,
        riskScore: result.riskScore,
      },
    });

    return updated;
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
  // Admin: approve / reject decision (manual fallback, with tier assignment)
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
      // Guard the transition through the same machine as the provider path.
      assertTransition(profile.status, 'APPROVED');
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
    assertTransition(profile.status, 'REJECTED');
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
