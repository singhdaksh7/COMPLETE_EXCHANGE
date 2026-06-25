import type { CryptoChain, ResolvedNetwork } from '../crypto-deposit.config';

/**
 * Outcome of an on-chain verification attempt.
 *
 *   CONFIRMED               valid transfer to the master wallet, enough confirmations
 *   PENDING                 valid (or not-yet-mined) but below required confirmations
 *   REJECTED                definitively invalid (wrong contract/recipient/amount/failed)
 *   PROVIDER_NOT_CONFIGURED chain disabled or missing master/contract/endpoint
 *   PROVIDER_ERROR          transient provider/RPC failure — safe to retry/recheck
 */
export type VerificationOutcome =
  | 'CONFIRMED'
  | 'PENDING'
  | 'REJECTED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_ERROR';

export interface VerificationResult {
  outcome: VerificationOutcome;
  /** Human-readable token amount (decimal string), present when a transfer parsed. */
  amount?: string;
  fromAddress?: string | null;
  toAddress?: string | null;
  confirmations?: number;
  minConfirmations?: number;
  logIndex?: number | null;
  /** Safe, non-sensitive reason — surfaced to users for REJECTED/errors. */
  reason?: string;
  /** Secrets-free summary persisted as rawVerificationSummary (audit/debug). */
  summary?: Record<string, unknown>;
}

export interface VerifyTxInput {
  chain: CryptoChain;
  txHash: string;
  network: ResolvedNetwork;
}

export interface UsdtDepositVerifier {
  verifyTx(input: VerifyTxInput): Promise<VerificationResult>;
}
