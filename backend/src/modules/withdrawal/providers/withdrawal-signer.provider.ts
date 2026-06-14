/**
 * Withdrawal signer/broadcaster abstraction.
 *
 * The seam between the withdrawal module and whatever actually signs and
 * broadcasts an on-chain transfer. Today only an offline mock exists; a real
 * implementation would call into a KMS/HSM (referenced by `signerRef.kmsKeyRef`)
 * and a node RPC.
 *
 * HARD RULES enforced by the contract:
 *   - inputs carry a `kmsKeyRef` HANDLE, never private key material;
 *   - amounts cross as INTEGER BASE-UNIT STRINGS, never JS floats;
 *   - the mock neither holds keys nor touches the network.
 */

/** Safe signer reference — a KMS handle, never the key itself. */
export interface SignerRef {
  id: string;
  kmsKeyRef: string;
  publicKey: string | null;
}

export interface SignTransferInput {
  chain: string;
  asset: string;
  contract: string;
  fromAddress: string;
  toAddress: string;
  /** Transfer value in integer token base units, as a decimal string. */
  amountBase: string;
  nonce: bigint;
  signer: SignerRef;
}

export interface SignedTransaction {
  /** Deterministic tx hash bound to (fromAddress, nonce) for idempotency. */
  txHash: string;
  /** Opaque serialized signed transaction (mock: a deterministic blob). */
  rawTx: string;
}

export interface BroadcastResult {
  txHash: string;
}

export interface TxConfirmation {
  /** Whether the broadcast tx is known to the (mock) network. */
  found: boolean;
  confirmations: number;
  /** False once a tx is known to have failed / been dropped. */
  success: boolean;
}

export interface WithdrawalSignerProvider {
  readonly name: string;
  readonly mode: 'mock' | 'live';

  /** Sign a TRC20 transfer. Never uses real keys. */
  signTransfer(input: SignTransferInput): Promise<SignedTransaction>;

  /** Broadcast a signed tx (mock: simulate acceptance). */
  broadcast(input: { chain: string; signedTx: SignedTransaction }): Promise<BroadcastResult>;

  /** Poll confirmation depth / success for a broadcast tx. */
  getConfirmations(input: { chain: string; txHash: string }): Promise<TxConfirmation>;
}
