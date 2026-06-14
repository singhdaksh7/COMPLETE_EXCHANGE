import type { KycDocType } from '@prisma/client';

/**
 * DigiLocker provider abstraction.
 *
 * DigiLocker is India's government-issued digital document wallet. A real
 * integration begins a user-consent (OAuth-style) flow, then pulls verified,
 * issuer-signed documents (PAN, Aadhaar, etc.) on the user's behalf.
 *
 * This interface is the seam the rest of the KYC module codes against, so the
 * mock used today and a real client added later are interchangeable. Concrete
 * implementations MUST:
 *   - never return raw PII (PAN/Aadhaar numbers) — only secure storage keys and
 *     content hashes for documents fetched into our own storage, and
 *   - never expose public URLs for those documents.
 */
export interface DigiLockerIssuedDocument {
  docType: KycDocType;
  /** Secure object-storage key (NOT a public URL). */
  storageKey: string;
  /** SHA-256 of the stored bytes, for integrity. */
  sha256: string;
}

export interface DigiLockerSession {
  /** Stable provider identifier persisted on the KYC profile (`provider`). */
  provider: string;
  /** Opaque per-session reference persisted on the profile (`provider_ref`). */
  providerRef: string;
  /** Consent URL the user is redirected to. Stub points at a non-routable host. */
  authorizationUrl: string;
  /** Seconds until the authorization session expires. */
  expiresIn: number;
}

export interface DigiLockerProvider {
  /** Human-readable implementation name (e.g. 'digilocker-mock'). */
  readonly name: string;

  /** Begin a consent session for a user; returns the authorization handle. */
  createSession(input: { userId: string }): Promise<DigiLockerSession>;

  /**
   * Fetch the documents the user consented to share, already pulled into our
   * secure storage. Returns metadata only — storage keys + hashes, never PII.
   */
  fetchIssuedDocuments(input: {
    userId: string;
    providerRef: string;
  }): Promise<DigiLockerIssuedDocument[]>;
}
