import { config } from '../../../config';
import { createMockWithdrawalSigner } from './withdrawal-signer.mock';
import { createTestnetLocalSigner } from './withdrawal-signer.testnet-local';
import type { WithdrawalSignerProvider } from './withdrawal-signer.provider';

let cached: WithdrawalSignerProvider | undefined;

/**
 * Resolve the active withdrawal signer.
 *
 * Selection order:
 *   - SIGNER_MODE=testnet-local → real EVM testnet signer, but ONLY when
 *     CHAIN_ENV=testnet AND ALLOW_TESTNET_SIGNING=YES (the factory itself
 *     re-checks and throws otherwise — fail closed).
 *   - otherwise → the offline mock (default; no keys, no network).
 *
 * The legacy WITHDRAWAL_SIGNER=live path remains intentionally UNIMPLEMENTED:
 * there is no mainnet signing in this codebase, so selecting it fails loudly.
 */
export function getWithdrawalSigner(): WithdrawalSignerProvider {
  if (cached) return cached;

  if (config.withdrawal.signerMode === 'testnet-local') {
    // The factory enforces the fail-closed gates (chainEnv + allowSigning).
    cached = createTestnetLocalSigner();
    return cached;
  }

  if (config.withdrawal.signer === 'live') {
    throw new Error(
      'Live withdrawal signing is not implemented; set WITHDRAWAL_SIGNER=mock',
    );
  }
  cached = createMockWithdrawalSigner();
  return cached;
}

/** Test helper: drop the memoized signer so config changes take effect. */
export function resetWithdrawalSigner(): void {
  cached = undefined;
}

export type {
  WithdrawalSignerProvider,
  SignerRef,
  SignedTransaction,
  TxConfirmation,
} from './withdrawal-signer.provider';
export { createMockWithdrawalSigner } from './withdrawal-signer.mock';
export type { MockWithdrawalSigner } from './withdrawal-signer.mock';
