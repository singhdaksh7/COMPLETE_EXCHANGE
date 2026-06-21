import { createHash, randomUUID } from 'node:crypto';
import type {
  LivenessProvider,
  LivenessResult,
  LivenessSession,
} from './liveness-provider';

/**
 * Mock liveness provider.
 *
 * Deterministic, fully offline stand-in for a real liveness vendor. It performs
 * NO network calls and stores NO biometric data: sessions are opaque references
 * and results carry only a normalized outcome + confidence — exactly the shape a
 * real client hands back. The capture URL points at a non-routable host so it
 * can never accidentally reach a real endpoint.
 *
 * Default outcome is PASSED (high confidence) so staging can complete onboarding
 * without a vendor. A caller may pass `simulateOutcome` to drive FAILED /
 * REVIEW_REQUIRED for testing the downstream risk rules. The UI badges all of
 * this as mock data.
 */
const CAPTURE_BASE_URL = 'https://liveness-provider.mock.local/capture';
const SESSION_TTL_SEC = 600;

function opaqueRef(prefix: string, userId: string): string {
  return `${prefix}_${createHash('sha256')
    .update(`${userId}:${randomUUID()}`)
    .digest('hex')
    .slice(0, 24)}`;
}

export const livenessMockProvider: LivenessProvider = {
  name: 'liveness-mock',
  mode: 'mock',

  async createSession({ userId }): Promise<LivenessSession> {
    const providerReference = opaqueRef('live', userId);
    return {
      provider: 'liveness-mock',
      mode: 'mock',
      providerReference,
      sessionId: providerReference,
      status: 'PENDING',
      captureUrl: `${CAPTURE_BASE_URL}/${opaqueRef('tok', userId)}`,
      expiresInSec: SESSION_TTL_SEC,
    };
  },

  async verifySession({ providerReference, simulateOutcome }): Promise<LivenessResult> {
    const status = simulateOutcome ?? 'PASSED';
    const confidence =
      status === 'PASSED' ? 0.97 : status === 'REVIEW_REQUIRED' ? 0.62 : 0.21;
    return {
      provider: 'liveness-mock',
      mode: 'mock',
      providerReference,
      status,
      confidence,
    };
  },
};
