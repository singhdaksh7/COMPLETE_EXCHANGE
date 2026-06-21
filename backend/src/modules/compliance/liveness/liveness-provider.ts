/**
 * Liveness provider abstraction (Stage 5.0).
 *
 * A vendor-neutral interface so the compliance flow never depends on a concrete
 * liveness vendor. Today only a deterministic offline mock is implemented;
 * future providers (Digilocker / HyperVerge / Signzy / IDfy / Onfido) implement
 * the same contract. Selection is via KYC_LIVENESS_PROVIDER.
 *
 * Providers return ONLY safe references + a normalized outcome — never raw
 * biometric frames, document images, or vendor credentials.
 */

export type LivenessOutcome = 'PASSED' | 'FAILED' | 'REVIEW_REQUIRED';
export type LivenessSessionStatus = 'PENDING' | LivenessOutcome;

export interface LivenessSession {
  /** Vendor identifier, e.g. 'liveness-mock'. */
  provider: string;
  /** 'mock' | 'live' — surfaced to the UI so mock data is clearly badged. */
  mode: 'mock' | 'live';
  /** Opaque, non-PII provider reference for the session. */
  providerReference: string;
  /** Opaque session id (may equal providerReference for simple providers). */
  sessionId: string;
  status: LivenessSessionStatus;
  /** Hosted capture URL (non-routable for the mock). */
  captureUrl: string;
  expiresInSec: number;
}

export interface LivenessResult {
  provider: string;
  mode: 'mock' | 'live';
  providerReference: string;
  status: LivenessOutcome;
  /** 0..1 confidence the subject is a live, matching person. */
  confidence: number;
}

export interface LivenessProvider {
  name: string;
  mode: 'mock' | 'live';
  createSession(input: { userId: string }): Promise<LivenessSession>;
  verifySession(input: {
    userId: string;
    providerReference: string;
    sessionId?: string;
    /**
     * STAGING/MOCK ONLY: lets a caller deterministically drive a non-happy path
     * (e.g. to exercise the liveness-failed risk rule). Ignored by real vendors.
     */
    simulateOutcome?: LivenessOutcome;
  }): Promise<LivenessResult>;
}
