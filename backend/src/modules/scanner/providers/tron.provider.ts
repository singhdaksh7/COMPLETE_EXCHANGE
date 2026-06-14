/**
 * TRON chain RPC provider abstraction.
 *
 * The scanner codes against this seam so the offline mock used in dev/tests and
 * a real TronGrid-backed client are interchangeable. The provider is READ-ONLY
 * chain access — it fetches block heads and TRC20 Transfer events. It never
 * holds keys and never broadcasts transactions.
 *
 * Money values cross this boundary as INTEGER BASE-UNIT STRINGS (token smallest
 * unit, e.g. 6-dp USDT), never as JS floats — the scanner converts to a Decimal
 * human amount only for ledger display.
 */

/** A block identity — number + canonical hash (for reorg detection). */
export interface BlockRef {
  number: bigint;
  hash: string;
}

/** A single TRC20 `Transfer(from,to,value)` event observed on-chain. */
export interface Trc20Transfer {
  txHash: string;
  /** Event/log index within the tx — part of the dedupe key. */
  logIndex: number;
  from: string;
  to: string;
  /** TRC20 token contract address (e.g. USDT). */
  contract: string;
  /** Transfer value in integer token base units, as a decimal string. */
  amountBase: string;
  blockNumber: bigint;
  blockHash: string;
}

export interface GetTransfersInput {
  /** TRC20 contract to filter Transfer events by. */
  contract: string;
  fromBlock: bigint;
  toBlock: bigint;
}

export interface TronProvider {
  /** Human-readable implementation name (e.g. 'tron-mock'). */
  readonly name: string;
  /** 'mock' (offline) or 'live' (TronGrid). */
  readonly mode: 'mock' | 'live';

  /** Latest block at the chain tip. */
  getLatestBlock(): Promise<BlockRef>;

  /** Resolve a block's canonical identity, or null if beyond the head. */
  getBlock(blockNumber: bigint): Promise<BlockRef | null>;

  /** TRC20 Transfer events for a contract across an inclusive block range. */
  getTrc20Transfers(input: GetTransfersInput): Promise<Trc20Transfer[]>;
}
