import type {
  BlockRef,
  GetTransfersInput,
  TokenTransfer,
} from './chain.provider';
import type { EvmProvider } from './evm.provider';

/**
 * Mock EVM provider (Ethereum / BSC).
 *
 * A fully-offline, in-memory simulation of an EVM node used in dev and tests —
 * NO network calls. Mirrors the TRON mock's test-control surface so the same
 * scanner exercises every chain:
 *   - `setHead(n)`          — advance the chain tip (grows confirmations)
 *   - `addTransfer(t)`      — script an ERC20/BEP20 Transfer into a block
 *   - `removeTransfer(...)` — drop a tx (simulate it vanishing in a reorg)
 *   - `setBlockHash(n, h)`  — rewrite a block's hash (simulate a reorg)
 *
 * Block hashes are deterministic (`<chain>_block_<n>`) unless overridden, and a
 * transfer's reported `blockHash` always resolves from the CURRENT hash of its
 * block, so a reorg via `setBlockHash` propagates to returned transfers.
 */
export interface MockEvmProvider extends EvmProvider {
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

export function createMockEvmProvider(chain: string, seed: MockSeed = {}): MockEvmProvider {
  const chainId = chain.toUpperCase();
  let head = seed.head ?? 0n;
  const hashOverrides = new Map<bigint, string>();
  let transfers: Array<Omit<TokenTransfer, 'blockHash'>> = [...(seed.transfers ?? [])];

  const hashFor = (n: bigint): string =>
    hashOverrides.get(n) ?? `${chainId.toLowerCase()}_block_${n}`;

  return {
    name: `evm-mock:${chainId}`,
    chain: chainId,
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
    addTransfer(t: Omit<TokenTransfer, 'blockHash'>): void {
      transfers.push(t);
    },
    removeTransfer(txHash: string, logIndex: number): void {
      transfers = transfers.filter((t) => !(t.txHash === txHash && t.logIndex === logIndex));
    },
    reset(): void {
      head = 0n;
      hashOverrides.clear();
      transfers = [];
    },
  };
}
