import { createHash } from 'node:crypto';
import type {
  BroadcastResult,
  SignTransferInput,
  SignedTransaction,
  TxConfirmation,
  WithdrawalSignerProvider,
} from './withdrawal-signer.provider';

/**
 * Mock withdrawal signer/broadcaster.
 *
 * Fully offline and deterministic. It NEVER touches a private key and NEVER
 * broadcasts a real transaction. The tx hash is a deterministic function of
 * (fromAddress, nonce, toAddress, amountBase), so a re-broadcast at the same
 * nonce yields the same hash — which, combined with the unique
 * (chain, from_address, nonce) constraint, makes broadcasting idempotent.
 *
 * It also simulates the network's confirmation view: after `broadcast`, a tx is
 * tracked with 0 confirmations; tests drive it via `confirm()` / `failTx()`.
 */
export interface MockWithdrawalSigner extends WithdrawalSignerProvider {
  /** Set the confirmation depth for a broadcast tx (test control). */
  confirm(txHash: string, confirmations: number): void;
  /** Mark a broadcast tx as failed/dropped (test control). */
  failTx(txHash: string): void;
  reset(): void;
}

interface TxState {
  confirmations: number;
  success: boolean;
}

export function createMockWithdrawalSigner(): MockWithdrawalSigner {
  const txs = new Map<string, TxState>();

  function hashFor(input: {
    fromAddress: string;
    nonce: bigint;
    toAddress: string;
    amountBase: string;
  }): string {
    const digest = createHash('sha256')
      .update(
        `${input.fromAddress}|${input.nonce.toString()}|${input.toAddress}|${input.amountBase}`,
      )
      .digest('hex')
      .slice(0, 56);
    return `trxw_${digest}`;
  }

  return {
    name: 'withdrawal-signer-mock',
    mode: 'mock',

    async signTransfer(input: SignTransferInput): Promise<SignedTransaction> {
      const txHash = hashFor(input);
      // The "rawTx" is an opaque, key-free blob — purely a placeholder.
      const rawTx = Buffer.from(
        `${input.chain}:${input.contract}:${txHash}`,
      ).toString('base64');
      return { txHash, rawTx };
    },

    async broadcast(input: {
      chain: string;
      signedTx: SignedTransaction;
    }): Promise<BroadcastResult> {
      // Idempotent: re-broadcasting the same hash keeps its existing state.
      if (!txs.has(input.signedTx.txHash)) {
        txs.set(input.signedTx.txHash, { confirmations: 0, success: true });
      }
      return { txHash: input.signedTx.txHash };
    },

    async getConfirmations(input: {
      chain: string;
      txHash: string;
    }): Promise<TxConfirmation> {
      const state = txs.get(input.txHash);
      if (!state) return { found: false, confirmations: 0, success: true };
      return { found: true, confirmations: state.confirmations, success: state.success };
    },

    // ---- test controls ----
    confirm(txHash: string, confirmations: number): void {
      const state = txs.get(txHash) ?? { confirmations: 0, success: true };
      state.confirmations = confirmations;
      txs.set(txHash, state);
    },
    failTx(txHash: string): void {
      const state = txs.get(txHash) ?? { confirmations: 0, success: true };
      state.success = false;
      txs.set(txHash, state);
    },
    reset(): void {
      txs.clear();
    },
  };
}
