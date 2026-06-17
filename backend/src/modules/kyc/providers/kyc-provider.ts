import type { KycDocType } from '@prisma/client';

/**
 * Generic, vendor-neutral KYC provider abstraction.
 *
 * This is the single seam the rest of the KYC module codes against, so the
 * offline mock used today and any real vendor wired later (HyperVerge, Signzy,
 * IDfy, Karza, Surepass, AuthBridge, OnGrid, Sumsub, …) are interchangeable.
 *
 * Concrete implementations MUST:
 *   - never return raw PII (full PAN / Aadhaar numbers) — only MASKED values,
 *     secure storage keys, and content hashes, and
 *   - never expose public, fetchable document URLs.
 *
 * The provider is responsible only for talking to the vendor and NORMALIZING
 * its responses into the shapes below. All persistence, idempotency, and KYC
 * status-transition decisions live in the service layer.
 */

/** Normalized, provider-independent verification outcome. */
export type KycVerificationStatus =
  | 'PENDING' // awaiting user action / provider still processing
  | 'IN_REVIEW' // provider is actively evaluating
  | 'APPROVED' // provider cleared the applicant
  | 'REJECTED' // provider rejected the applicant
  | 'MANUAL_REVIEW'; // inconclusive — hand to an admin reviewer

/** Normalized status of an individual check (liveness, document, …). */
export type KycCheckStatus = 'PENDING' | 'PASS' | 'FAIL' | 'UNAVAILABLE';

/**
 * A provider session the user is sent through (hosted redirect or SDK token).
 * Persisted onto the KYC profile so later webhooks/polls can be attributed.
 */
export interface KycSession {
  /** Stable provider identifier persisted on the profile (`provider`). */
  provider: string;
  /** Opaque per-session id persisted on the profile (`provider_session_id`). */
  providerSessionId: string;
  /** Vendor applicant id, when the vendor issues one (`provider_applicant_id`). */
  providerApplicantId: string | null;
  /** URL the user is redirected to (or SDK host). Non-routable in the mock. */
  redirectUrl: string;
  /** Seconds until the session expires. */
  expiresIn: number;
}

/**
 * Normalized verification result. Carries ONLY masked identifiers — never the
 * raw PAN/Aadhaar. `riskScore` is 0–100 (higher = riskier) when the vendor
 * supplies one, else null.
 */
export interface KycProviderResult {
  status: KycVerificationStatus;
  livenessStatus: KycCheckStatus;
  documentStatus: KycCheckStatus;
  riskScore: number | null;
  rejectionReason: string | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
}

/** A verified, normalized inbound webhook event. */
export interface KycWebhookEvent {
  /** Vendor's unique event id — the idempotency key. */
  providerEventId: string;
  eventType: string;
  /** Used to attribute the event back to a KYC profile. */
  providerSessionId: string | null;
  providerApplicantId: string | null;
  result: KycProviderResult;
}

/** Raw inbound webhook request, handed to the provider for verification. */
export interface KycWebhookInput {
  /** Exact request bytes — required for HMAC signature verification. */
  rawBody: string | undefined;
  /** Vendor signature header value. */
  signature: string | undefined;
  /** Vendor event id header value (fallback when not in the body). */
  eventId: string | undefined;
  /** Parsed JSON body. */
  body: unknown;
}

export interface KycProvider {
  /** Human-readable implementation name (e.g. 'kyc-mock'). */
  readonly name: string;

  /** Begin a verification session for a user; returns the redirect/SDK handle. */
  createKycSession(input: { userId: string }): Promise<KycSession>;

  /**
   * Register a document the user uploaded for verification. Receives only a
   * secure storage key + content hash — never the raw bytes here.
   */
  submitDocuments(input: {
    userId: string;
    providerSessionId: string;
    docType: KycDocType;
    storageKey: string;
    sha256: string;
  }): Promise<{ documentStatus: KycCheckStatus }>;

  /** Poll the vendor for the latest normalized result for a session. */
  getStatus(input: {
    providerSessionId: string;
    providerApplicantId: string | null;
  }): Promise<KycProviderResult>;

  /**
   * Verify an inbound webhook's signature over the raw body and normalize it.
   * Returns `null` when the signature is missing or invalid (the service then
   * rejects the request) — implementations MUST NOT throw on a bad signature.
   */
  verifyWebhook(input: KycWebhookInput): Promise<KycWebhookEvent | null>;
}
