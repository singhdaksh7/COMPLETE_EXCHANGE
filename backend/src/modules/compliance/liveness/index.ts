import { livenessMockProvider } from './liveness.mock';
import type { LivenessProvider } from './liveness-provider';

/**
 * Resolve the active liveness provider from KYC_LIVENESS_PROVIDER.
 *
 * Only the offline mock is implemented today. 'external' is accepted (so wiring
 * can be exercised) but falls back to the mock — there is no half-built vendor
 * client that could silently degrade a custodial onboarding flow.
 */
export function getLivenessProvider(): LivenessProvider {
  // When a real vendor is added, branch on config.compliance.livenessProvider.
  return livenessMockProvider;
}

export type {
  LivenessProvider,
  LivenessSession,
  LivenessResult,
  LivenessOutcome,
  LivenessSessionStatus,
} from './liveness-provider';
