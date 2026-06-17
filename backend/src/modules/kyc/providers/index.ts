import { config } from '../../../config';
import { kycMockProvider } from './kyc.mock';
import { kycExternalProvider } from './kyc.external';
import type { KycProvider } from './kyc-provider';

/**
 * Resolve the active KYC provider from `KYC_PROVIDER`.
 *
 *   mock     — deterministic, offline stand-in (default).
 *   external — real vendor; STUB until Phase 3 (its methods throw loudly).
 *
 * Selecting `external` is allowed (so routes/wiring can be exercised) but any
 * call into the unimplemented vendor client fails loudly — it can never
 * silently degrade in a custodial flow.
 */
export function getKycProvider(): KycProvider {
  return config.kyc.provider === 'external' ? kycExternalProvider : kycMockProvider;
}

export type {
  KycProvider,
  KycSession,
  KycProviderResult,
  KycWebhookEvent,
  KycWebhookInput,
  KycVerificationStatus,
  KycCheckStatus,
} from './kyc-provider';
