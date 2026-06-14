import type {
  BlockRef,
  GetTransfersInput,
  Trc20Transfer,
  TronProvider,
} from './tron.provider';

/**
 * Mock TRON provider.
 *
 * A fully-offline, in-memory simulation of a TRON node used in dev and tests.
 * It performs NO network calls. Tests drive it imperatively:
 *   - `setHead(n)`          — advance the chain tip (grows confirmations)
 *   - `addTransfer(t)`      — script a TRC20 Transfer into a block
 *   - `removeTransfer(...)` — drop a tx (simulate it vanishing in a reorg)
 *   - `setBlockHash(n, h)`  — rewrite a block's hash (simulate a reorg)
 *
 * Block hashes are deterministic (`tron_block_<n>`) unless overridden, and a
 * transfer's reported `blockHash` is always resolved from the CURRENT hash of
 * its block, so a reorg via `setBlockHash` propagates to returned transfers.
 */
export interface MockTronProvider extends TronProvider {
  setHead(n: bigint): void;
  setBlockHash(n: bigint, hash: string): void;
  addTransfer(t: Omit<Trc20Transfer, 'blockHash'>): void;
  removeTransfer(txHash: string, logIndex: number): void;
  reset(): void;
}

interface MockSeed {
  head?: bigint;
  transfers?: Array<Omit<Trc20Transfer, 'blockHash'>>;
}

export function createMockTronProvider(seed: MockSeed = {}): MockTronProvider {
  let head = seed.head ?? 0n;
  const hashOverrides = new Map<bigint, string>();
  let transfers: Array<Omit<Trc20Transfer, 'blockHash'>> = [
    ...(seed.transfers ?? []),
  ];

  const hashFor = (n: bigint): string => hashOverrides.get(n) ?? `tron_block_${n}`;

  return {
    name: 'tron-mock',
    mode: 'mock',

    async getLatestBlock(): Promise<BlockRef> {
      return { number: head, hash: hashFor(head) };
    },

    async getBlock(blockNumber: bigint): Promise<BlockRef | null> {
      if (blockNumber < 0n || blockNumber > head) return null;
      return { number: blockNumber, hash: hashFor(blockNumber) };
    },

    async getTrc20Transfers(input: GetTransfersInput): Promise<Trc20Transfer[]> {
      return transfers
        .filter(
          (t) =>
            t.contract === input.contract &&
            t.blockNumber >= input.fromBlock &&
            t.blockNumber <= input.toBlock &&
            t.blockNumber <= head,
        )
        .map((t) => ({ ...t, blockHash: hashFor(t.blockNumber) }));
    },

    // ---- test controls ----
    setHead(n: bigint): void {
      head = n;
    },
    setBlockHash(n: bigint, hash: string): void {
      hashOverrides.set(n, hash);
    },
    addTransfer(t: Omit<Trc20Transfer, 'blockHash'>): void {
      transfers.push(t);
    },
    removeTransfer(txHash: string, logIndex: number): void {
      transfers = transfers.filter(
        (t) => !(t.txHash === txHash && t.logIndex === logIndex),
      );
    },
    reset(): void {
      head = 0n;
      hashOverrides.clear();
      transfers = [];
    },
  };
}
