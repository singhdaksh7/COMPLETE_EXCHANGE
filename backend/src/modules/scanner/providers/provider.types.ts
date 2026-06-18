/** A block identity — number + canonical hash (for reorg detection). */
export interface BlockRef {
  number: bigint;
  hash: string;
}

/** A single token Transfer event observed on-chain. */
export interface TokenTransfer {
  txHash: string;
  /** Event/log index within the tx — part of the dedupe key. */
  logIndex: number;
  from: string;
  to: string;
  /** Token contract address. */
  contract: string;
  /** Transfer value in integer token base units, as a decimal string. */
  amountBase: string;
  blockNumber: bigint;
  blockHash: string;
}

export interface GetTransfersInput {
  contract: string;
  fromBlock: bigint;
  toBlock: bigint;
}

export interface ChainProvider {
  /** Human-readable implementation name. */
  readonly name: string;
  /** 'mock' (offline) or 'live'. */
  readonly mode: 'mock' | 'live';

  /** Latest block at the chain tip. */
  getLatestBlock(): Promise<BlockRef>;

  /** Resolve a block's canonical identity, or null if beyond the head. */
  getBlock(blockNumber: bigint): Promise<BlockRef | null>;

  /** Transfer events for a contract across an inclusive block range. */
  getTokenTransfers(input: GetTransfersInput): Promise<TokenTransfer[]>;
}
