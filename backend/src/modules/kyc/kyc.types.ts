import type { KycDocument, KycDocType, KycProfile } from '@prisma/client';

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
  QUEUE_VIEW: 'kyc.queue.view',
  APPROVE: 'kyc.approve',
  REJECT: 'kyc.reject',
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
  decision: 'APPROVE' | 'REJECT';
  tier?: number;
  reason?: string;
}

/** Public KYC profile view (matches OpenAPI `KycProfile`). No PII leaves here. */
export interface KycProfileDto {
  status: string;
  tier: number;
  fullName: string | null;
  rejectedReason: string | null;
  reviewedAt: Date | null;
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

export interface KycSubmitResult {
  profile: KycProfileDto;
  digilocker: {
    authorizationUrl: string;
    expiresIn: number;
  };
}

/**
 * Admin-only review-queue row. Unlike the user-facing {@link KycProfileDto} it
 * carries the `userId` (needed to target the approve/reject endpoint) and the
 * user's email for display. PII from the profile itself is NOT included.
 */
export interface AdminKycQueueItem {
  userId: string;
  email: string;
  fullName: string | null;
  status: string;
  tier: number;
  submittedAt: Date;
}

export interface KycQueueResult {
  items: AdminKycQueueItem[];
  nextCursor: string | null;
}

export function toAdminKycQueueItem(
  profile: KycProfile & { user: { email: string; kycTier: number } },
): AdminKycQueueItem {
  return {
    userId: profile.userId,
    email: profile.user.email,
    fullName: profile.fullName,
    status: profile.status,
    tier: profile.user.kycTier,
    submittedAt: profile.createdAt,
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
    };
  }
  return {
    status: profile.status,
    tier,
    fullName: profile.fullName,
    rejectedReason: profile.rejectedReason,
    reviewedAt: profile.reviewedAt,
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
