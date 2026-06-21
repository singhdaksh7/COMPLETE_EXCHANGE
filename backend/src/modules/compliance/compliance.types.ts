import type {
  ComplianceConsent,
  ComplianceEvidence,
  ComplianceProfile,
  GeoCaptureStatus,
  RiskAssessment,
  ScreeningCheckStatus,
} from '@prisma/client';

/** Request-scoped forensic context for audit logging. */
export interface ComplianceContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Version stamp written onto every consent row captured by this build. */
export const CONSENT_VERSION = 'v1-2026-06';

/* ------------------------------------------------------------------ */
/* Masking helpers — raw identifiers are NEVER persisted/returned.    */
/* ------------------------------------------------------------------ */

/** Last 4 visible chars of an identifier, or null. */
export function last4(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.replace(/\s+/g, '');
  return v.length >= 4 ? v.slice(-4) : null;
}

/** `ABCDE1234F` -> `ABCDE****F` (PAN). Null for malformed input. */
export function maskPan(pan: string | null | undefined): string | null {
  if (!pan) return null;
  const v = pan.trim().toUpperCase();
  if (v.length !== 10) return null;
  return `${v.slice(0, 5)}****${v.slice(9)}`;
}

/** `123412341234` -> `XXXX XXXX 1234` (Aadhaar). Null for malformed input. */
export function maskAadhaar(aadhaar: string | null | undefined): string | null {
  if (!aadhaar) return null;
  const v = aadhaar.replace(/\s+/g, '');
  if (v.length < 4) return null;
  return `XXXX XXXX ${v.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Safe geo / device evidence extraction from request headers.        */
/* ------------------------------------------------------------------ */

export interface GeoEvidence {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  userAgent: string | null;
  status: GeoCaptureStatus;
}

type HeaderBag = Record<string, string | string[] | undefined>;

function header(headers: HeaderBag, name: string): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Build coarse, audit-safe geo evidence from request headers. Prefers AWS
 * CloudFront viewer headers (populated at the edge) and falls back to the
 * socket IP. Never performs IP→geo lookups here and never stores precise
 * device fingerprints — only the values the edge already attached.
 */
export function extractGeoEvidence(meta: { ip?: string | null; headers: HeaderBag }): GeoEvidence {
  const country = header(meta.headers, 'cloudfront-viewer-country');
  const region = header(meta.headers, 'cloudfront-viewer-country-region');
  const city = header(meta.headers, 'cloudfront-viewer-city');
  const latitude = header(meta.headers, 'cloudfront-viewer-latitude');
  const longitude = header(meta.headers, 'cloudfront-viewer-longitude');
  const userAgent = header(meta.headers, 'user-agent');

  const present = [country, region, city].filter(Boolean).length;
  let status: GeoCaptureStatus;
  if (present === 0) status = 'NOT_CAPTURED';
  else if (country && present >= 2) status = 'CAPTURED';
  else status = 'PARTIAL';

  return {
    ip: meta.ip ?? null,
    country,
    region,
    city,
    latitude,
    longitude,
    userAgent,
    status,
  };
}

/* ------------------------------------------------------------------ */
/* DTOs                                                               */
/* ------------------------------------------------------------------ */

/** User-facing compliance status. Masked-only; no internal notes/IP detail. */
export interface UserComplianceDto {
  status: ComplianceProfile['status'];
  customerType: ComplianceProfile['customerType'];
  fullName: string | null;
  countryOfResidence: string | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
  riskLevel: ComplianceProfile['riskLevel'];
  livenessStatus: ComplianceProfile['livenessStatus'];
  sanctionsStatus: ComplianceProfile['sanctionsStatus'];
  pepStatus: ComplianceProfile['pepStatus'];
  adverseMediaStatus: ComplianceProfile['adverseMediaStatus'];
  /** Overall screening outcome (Stage 5.1); attached by the service layer. */
  screeningStatus: ScreeningCheckStatus | 'NOT_SCREENED';
  geoCaptureStatus: ComplianceProfile['geoCaptureStatus'];
  submittedAt: Date | null;
  lastReviewedAt: Date | null;
  nextReviewDueAt: Date | null;
  rejectionReason: string | null;
  // Honest staging signal: screening/liveness here are mock-driven.
  providerMode: 'mock' | 'live';
}

export function toUserComplianceDto(
  profile: ComplianceProfile | null,
  providerMode: 'mock' | 'live',
): UserComplianceDto | null {
  if (!profile) return null;
  return {
    status: profile.status,
    customerType: profile.customerType,
    fullName: profile.fullName,
    countryOfResidence: profile.countryOfResidence,
    panMasked: profile.panMasked,
    aadhaarMasked: profile.aadhaarMasked,
    riskLevel: profile.riskLevel,
    livenessStatus: profile.livenessStatus,
    sanctionsStatus: profile.sanctionsStatus,
    pepStatus: profile.pepStatus,
    adverseMediaStatus: profile.adverseMediaStatus,
    // Populated by complianceService.withScreeningStatus; default keeps the DTO
    // valid when computed without a screening lookup.
    screeningStatus: profile.sanctionsStatus === 'NOT_SCREENED' ? 'NOT_SCREENED' : 'PENDING',
    geoCaptureStatus: profile.geoCaptureStatus,
    submittedAt: profile.status === 'NOT_STARTED' ? null : profile.createdAt,
    lastReviewedAt: profile.lastReviewedAt,
    nextReviewDueAt: profile.nextReviewDueAt,
    rejectionReason: profile.status === 'REJECTED' || profile.status === 'NEEDS_MORE_INFO' ? profile.riskReason : null,
    providerMode,
  };
}

/** Admin-facing evidence row (locators + redacted metadata only). */
export function toEvidenceDto(e: ComplianceEvidence) {
  return {
    id: e.id,
    type: e.type,
    status: e.status,
    provider: e.provider,
    referenceId: e.referenceId,
    storageKey: e.storageKey,
    documentId: e.documentId,
    metadata: e.metadata,
    createdAt: e.createdAt,
    reviewedAt: e.reviewedAt,
    reviewedByAdminId: e.reviewedByAdminId,
  };
}

export function toConsentDto(c: ComplianceConsent) {
  return {
    id: c.id,
    consentType: c.consentType,
    version: c.version,
    ip: c.ip,
    userAgent: c.userAgent,
    acceptedAt: c.acceptedAt,
  };
}

export function toRiskAssessmentDto(r: RiskAssessment) {
  return {
    id: r.id,
    score: r.score,
    level: r.level,
    reasons: r.reasons,
    source: r.source,
    createdAt: r.createdAt,
    createdByAdminId: r.createdByAdminId,
  };
}

/**
 * Admin compliance detail. Masked identifiers + onboarding evidence + internal
 * note. Never includes encrypted blobs, raw IDs, or document content.
 */
export function toAdminComplianceDto(
  profile: ComplianceProfile & { user: { email: string; status: string; kycStatus: string; kycTier: number } },
) {
  return {
    userId: profile.userId,
    email: profile.user.email,
    accountStatus: profile.user.status,
    legacyKycStatus: profile.user.kycStatus,
    kycTier: profile.user.kycTier,
    customerType: profile.customerType,
    status: profile.status,
    fullName: profile.fullName,
    dateOfBirth: profile.dateOfBirth,
    nationality: profile.nationality,
    countryOfResidence: profile.countryOfResidence,
    address: {
      line1: profile.addressLine1,
      line2: profile.addressLine2,
      city: profile.city,
      state: profile.state,
      postalCode: profile.postalCode,
      country: profile.country,
    },
    panMasked: profile.panMasked,
    panLast4: profile.panLast4,
    aadhaarMasked: profile.aadhaarMasked,
    aadhaarLast4: profile.aadhaarLast4,
    riskLevel: profile.riskLevel,
    riskScore: profile.riskScore,
    riskReason: profile.riskReason,
    onboarding: {
      ip: profile.onboardingIp,
      country: profile.onboardingCountry,
      region: profile.onboardingRegion,
      city: profile.onboardingCity,
      latitude: profile.onboardingLatitude,
      longitude: profile.onboardingLongitude,
      userAgent: profile.onboardingUserAgent,
      geoCaptureStatus: profile.geoCaptureStatus,
    },
    livenessStatus: profile.livenessStatus,
    livenessProvider: profile.livenessProvider,
    livenessReference: profile.livenessReference,
    livenessScore: profile.livenessScore,
    sanctionsStatus: profile.sanctionsStatus,
    pepStatus: profile.pepStatus,
    adverseMediaStatus: profile.adverseMediaStatus,
    kycProvider: profile.kycProvider,
    kycProviderReference: profile.kycProviderReference,
    consentVersion: profile.consentVersion,
    complianceNote: profile.complianceNote,
    verifiedAt: profile.verifiedAt,
    lastReviewedAt: profile.lastReviewedAt,
    nextReviewDueAt: profile.nextReviewDueAt,
    retentionUntil: profile.retentionUntil,
    reviewedByAdminId: profile.reviewedByAdminId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
