import { evmVerifier } from './evm.verifier';
import { tronVerifier } from './tron.verifier';
import type { UsdtDepositVerifier, VerificationResult, VerifyTxInput } from './types';

/**
 * Unified USDT deposit verifier. Dispatches to the chain-family verifier:
 * EVM (BSC/ETH) is live; TRON is a clean stub (provider_not_configured) until a
 * future PR. Never throws — a provider/transport failure surfaces as
 * PROVIDER_ERROR so the caller can mark the deposit retryable, not rejected.
 */
export const usdtDepositVerifier: UsdtDepositVerifier = {
  async verifyTx(input: VerifyTxInput): Promise<VerificationResult> {
    if (input.network.family === 'EVM') return evmVerifier.verifyTx(input);
    return tronVerifier.verifyTx(input);
  },
};

export * from './types';
