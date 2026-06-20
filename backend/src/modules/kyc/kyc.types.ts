import type {
  KycCheckStatus,
  KycDocument,
  KycDocType,
  KycProfile,
} from '@prisma/client';
import type { KycSession } from './providers';

/** Request-scoped forensic context threaded into the service for auditing. */
export interface KycContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Stable KYC action codes (kept together to avoid typos in the audit trail). */
export const KycAction = {
  PROFILE_SUBMIT: 'kyc.profile.submit',
  DOCUMENT_SUBMIT: 'kyc.document.submit',
  SESSION_CREATE: 'kyc.session.create',
  PROVIDER_UPDATE: 'kyc.provider.update',
  WEBHOOK_RECEIVED: 'kyc.webhook.received',
  WEBHOOK_INVALID_SIGNATURE: 'kyc.webhook.invalid_signature',
  WEBHOOK_DUPLICATE: 'kyc.webhook.duplicate',
  QUEUE_VIEW: 'kyc.queue.view',
  DETAIL_VIEW: 'kyc.detail.view',
  APPROVE: 'kyc.approve',
  REJECT: 'kyc.reject',
  REQUEST_INFO: 'kyc.request_info',
  NOTE: 'kyc.note',
  COMPLIANCE_VIEW: 'kyc.compliance.view',
} as const;

export interface SubmitProfileInput {
  fullName: string;
  dob: string; // YYYY-MM-DD
  pan: string;
  aadhaarRef?: string;
  address?: Record<string, unknown>;
}

export interface SubmitDocumentInput {
  docType: KycDocType;
  sha256: string;
  contentType: string;
}

export interface KycDecisionInput {
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO';
  tier?: number;
  reason?: string;
  complianceNote?: string;
}

/** Public KYC profile view (matches OpenAPI `KycProfile`). No raw PII leaves here. */
export interface KycProfileDto {
  status: string;
  tier: number;
  fullName: string | null;
  rejectedReason: string | null;
  reviewedAt: Date | null;
  // Generic provider outcome (vendor-neutral; masked identifiers only).
  provider: string | null;
  livenessStatus: KycCheckStatus | null;
  documentStatus: KycCheckStatus | null;
  riskScore: number | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
}

export interface KycDocumentDto {
  id: string;
  docType: KycDocType;
  status: string;
  createdAt: Date;
}

/** Upload handle returned on document registration. The URL is never persisted. */
export interface KycDocumentUploadDto {
  documentId: string;
  uploadUrl: string;
  expiresIn: number;
}

/** Public, vendor-neutral view of a provider session handed to the client. */
export interface KycSessionDto {
  provider: string;
  providerSessionId: string;
  redirectUrl: string;
  expiresIn: number;
}

export interface KycSubmitResult {
  profile: KycProfileDto;
  session: KycSessionDto;
}

/** Result of inbound webhook ingestion (returned to the controller). */
export interface KycWebhookResult {
  status: 'processed' | 'duplicate' | 'ignored';
}

/**
 * Admin-only review-queue row. Unlike the user-facing {@link KycProfileDto} it
 * carries the `userId` (needed to target the approve/reject endpoint) and the
 * user's email for display, plus the provider outcome the reviewer needs.
 * Raw PII from the profile is NEVER included.
 */
export interface AdminKycQueueItem {
  userId: string;
  email: string;
  fullName: string | null;
  status: string;
  tier: number;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectedReason: string | null;
  riskLevel: string;
  accountStatus: string;
  provider: string | null;
  livenessStatus: KycCheckStatus | null;
  documentStatus: KycCheckStatus | null;
  riskScore: number | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
}

export interface KycQueueResult {
  items: AdminKycQueueItem[];
  nextCursor: string | null;
}

/** One entry in the per-user KYC action timeline (from admin_logs). */
export interface KycTimelineEntry {
  id: string;
  action: string;
  actorAdminId: string;
  actorEmail: string | null;
  reason: string | null;
  occurredAt: Date;
}

/**
 * Full admin KYC review view for one user. Extends the queue item with the
 * internal compliance note, identity details (masked), documents, a recent
 * deposit/withdrawal summary, and the KYC action timeline. The internal
 * compliance note appears here (admin surface) but NEVER on the user DTO.
 */
export interface AdminKycDetail extends AdminKycQueueItem {
  dob: Date | null;
  address: unknown;
  complianceNote: string | null;
  riskNote: string | null;
  withdrawalsBlocked: boolean;
  documents: KycDocumentDto[];
  activity: {
    depositCount: number;
    withdrawalCount: number;
    lastDepositAt: Date | null;
    lastWithdrawalAt: Date | null;
  };
  timeline: KycTimelineEntry[];
}

/** Real, aggregate compliance metrics for the compliance dashboard. */
export interface ComplianceSummary {
  counts: {
    notStarted: number;
    pending: number;
    inReview: number;
    manualReview: number;
    needsMoreInfo: number;
    approved: number;
    rejected: number;
  };
  pendingOver24h: number;
  pendingOver48h: number;
  highRiskUsers: number;
  rejectionRatePct: number | null;
  recentActions: KycTimelineEntry[];
}

export function toKycSessionDto(session: KycSession): KycSessionDto {
  return {
    provider: session.provider,
    providerSessionId: session.providerSessionId,
    redirectUrl: session.redirectUrl,
    expiresIn: session.expiresIn,
  };
}

export type AdminKycProfileRow = KycProfile & {
  user: {
    email: string;
    kycTier: number;
    riskLevel: string;
    status: string;
  };
};

export function toAdminKycQueueItem(profile: AdminKycProfileRow): AdminKycQueueItem {
  return {
    userId: profile.userId,
    email: profile.user.email,
    fullName: profile.fullName,
    status: profile.status,
    tier: profile.user.kycTier,
    submittedAt: profile.createdAt,
    reviewedAt: profile.reviewedAt,
    reviewedBy: profile.reviewedBy,
    rejectedReason: profile.rejectedReason,
    riskLevel: profile.user.riskLevel,
    accountStatus: profile.user.status,
    provider: profile.provider,
    livenessStatus: profile.livenessStatus,
    documentStatus: profile.documentStatus,
    riskScore: profile.riskScore,
    panMasked: profile.panMasked,
    aadhaarMasked: profile.aadhaarMasked,
  };
}

/**
 * Map a profile (or its absence) to the public DTO. `fallbackStatus` is the
 * user's `kycStatus` (e.g. NOT_STARTED) used when no profile row exists yet.
 */
export function toKycProfileDto(
  profile: KycProfile | null,
  tier: number,
  fallbackStatus: string,
): KycProfileDto {
  if (!profile) {
    return {
      status: fallbackStatus,
      tier,
      fullName: null,
      rejectedReason: null,
      reviewedAt: null,
      provider: null,
      livenessStatus: null,
      documentStatus: null,
      riskScore: null,
      panMasked: null,
      aadhaarMasked: null,
    };
  }
  return {
    status: profile.status,
    tier,
    fullName: profile.fullName,
    rejectedReason: profile.rejectedReason,
    reviewedAt: profile.reviewedAt,
    provider: profile.provider,
    livenessStatus: profile.livenessStatus,
    documentStatus: profile.documentStatus,
    riskScore: profile.riskScore,
    panMasked: profile.panMasked,
    aadhaarMasked: profile.aadhaarMasked,
  };
}

export function toKycDocumentDto(doc: KycDocument): KycDocumentDto {
  return {
    id: doc.id,
    docType: doc.docType,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

/** Map an admin_logs row (with resolved admin email) to a timeline entry. */
export function toKycTimelineEntry(row: {
  id: bigint;
  action: string;
  adminId: string;
  reason: string | null;
  occurredAt: Date;
  admin?: { email: string } | null;
}): KycTimelineEntry {
  return {
    id: row.id.toString(),
    action: row.action,
    actorAdminId: row.adminId,
    actorEmail: row.admin?.email ?? null,
    reason: row.reason,
    occurredAt: row.occurredAt,
  };
}
