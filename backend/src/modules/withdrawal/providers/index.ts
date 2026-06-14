import { config } from '../../../config';
import { createMockWithdrawalSigner } from './withdrawal-signer.mock';
import type { WithdrawalSignerProvider } from './withdrawal-signer.provider';

let cached: WithdrawalSignerProvider | undefined;

/**
 * Resolve the active withdrawal signer.
 *
 * Defaults to the offline mock. 'live' is intentionally NOT implemented: we must
 * never sign or broadcast a real transaction from this codebase, so selecting it
 * fails loudly rather than silently degrading.
 */
export function getWithdrawalSigner(): WithdrawalSignerProvider {
  if (cached) return cached;
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
