/**
 * Generic chain RPC provider abstraction (Phase 5.1).
 *
 * The multi-chain scanner codes against this seam so the offline mocks (dev +
 * tests) and real node-backed clients (TronGrid / EVM JSON-RPC) are
 * interchangeable per chain. A provider is READ-ONLY chain access — it fetches
 * block heads and token `Transfer(from,to,value)` events. It NEVER holds keys
 * and NEVER broadcasts transactions (that is the withdrawal signer's job).
 *
 * Money values cross this boundary as INTEGER BASE-UNIT STRINGS (token smallest
 * unit, e.g. 6-dp USDT), never as JS floats — the scanner converts to a Decimal
 * human amount only for ledger display. TRC20 / ERC20 / BEP20 all share this
 * shape, which is what makes one scanner serve every chain.
 */

/** A block identity — number + canonical hash (for reorg detection). */
export interface BlockRef {
  number: bigint;
  hash: string;
}

/** A single token `Transfer(from,to,value)` event observed on-chain. */
export interface TokenTransfer {
  txHash: string;
  /** Event/log index within the tx — part of the dedupe key. */
  logIndex: number;
  from: string;
  to: string;
  /** Token contract address (TRC20/ERC20/BEP20 USDT). */
  contract: string;
  /** Transfer value in integer token base units, as a decimal string. */
  amountBase: string;
  blockNumber: bigint;
  blockHash: string;
}

export interface GetTransfersInput {
  /** Token contract to filter Transfer events by. */
  contract: string;
  fromBlock: bigint;
  toBlock: bigint;
}

export interface ChainProvider {
  /** Human-readable implementation name (e.g. 'tron-mock', 'evm-mock:ETHEREUM'). */
  readonly name: string;
  /** Chain id this provider serves ('TRON' | 'ETHEREUM' | 'BSC' | ...). */
  readonly chain: string;
  /** 'mock' (offline) or 'live' (real RPC). */
  readonly mode: 'mock' | 'live';

  /** Latest block at the chain tip. */
  getLatestBlock(): Promise<BlockRef>;

  /** Resolve a block's canonical identity, or null if beyond the head. */
  getBlock(blockNumber: bigint): Promise<BlockRef | null>;

  /** Token Transfer events for a contract across an inclusive block range. */
  getTokenTransfers(input: GetTransfersInput): Promise<TokenTransfer[]>;
}
