import type { VerificationResult, VerifyTxInput } from './types';

/**
 * TRON (TRC20) USDT deposit verifier — clean abstraction, intentionally inert
 * in V1.
 *
 * Correctly verifying a TRC20 transfer requires base58 ⇆ hex address decoding
 * and TronGrid event parsing. Rather than ship a half-checked path that could
 * ever fabricate a confirmed deposit (forbidden by the Stage 12 safety rules),
 * V1 reports TRON as not-configured. The shape matches the EVM verifier so a
 * future PR can drop in a real TronGrid implementation with no caller changes.
 */
export const tronVerifier = {
  async verifyTx(_input: VerifyTxInput): Promise<VerificationResult> {
    return {
      outcome: 'PROVIDER_NOT_CONFIGURED',
      reason: 'tron_verification_not_available_in_v1',
    };
  },
};
