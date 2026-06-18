import type { BlockRef, GetTransfersInput, TokenTransfer, BscProvider } from './bsc.provider';

export interface MockBscProvider extends BscProvider {
  setHead(n: bigint): void;
  setBlockHash(n: bigint, hash: string): void;
  addTransfer(t: Omit<TokenTransfer, 'blockHash'>): void;
  removeTransfer(txHash: string, logIndex: number): void;
  reset(): void;
}

interface MockSeed {
  head?: bigint;
  transfers?: Array<Omit<TokenTransfer, 'blockHash'>>;
}

export function createMockBscProvider(seed: MockSeed = {}): MockBscProvider {
  let head = seed.head ?? 0n;
  const hashOverrides = new Map<bigint, string>();
  let transfers: Array<Omit<TokenTransfer, 'blockHash'>> = [
    ...(seed.transfers ?? []),
  ];

  const hashFor = (n: bigint): string => hashOverrides.get(n) ?? `bsc_block_${n}`;

  return {
    name: 'bsc-mock',
    mode: 'mock',

    async getLatestBlock(): Promise<BlockRef> {
      return { number: head, hash: hashFor(head) };
    },

    async getBlock(blockNumber: bigint): Promise<BlockRef | null> {
      if (blockNumber < 0n || blockNumber > head) return null;
      return { number: blockNumber, hash: hashFor(blockNumber) };
    },

    async getTokenTransfers(input: GetTransfersInput): Promise<TokenTransfer[]> {
      return transfers
        .filter(
          (t) =>
            t.contract.toLowerCase() === input.contract.toLowerCase() &&
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
    addTransfer(t: Omit<TokenTransfer, 'blockHash'>): void {
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
