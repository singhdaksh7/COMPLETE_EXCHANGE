import type {
  BlockRef,
  GetTransfersInput,
  TokenTransfer,
} from './chain.provider';
import type { EvmProvider } from './evm.provider';
import { createJsonRpcClient, type JsonRpcClient } from './json-rpc';

/**
 * Live EVM provider (Ethereum / BSC) — READ-ONLY foundation (Phase 5.2).
 *
 * Reads chain data over JSON-RPC: latest block, a block by number, and ERC20/
 * BEP20 `Transfer` logs (`eth_getLogs`). It NEVER signs or broadcasts — there is
 * no write path here, and no keys cross this boundary. It is constructed only by
 * the resolver when `*_PROVIDER=live` AND a `*_RPC_URL` is configured; a missing
 * URL is a config error (thrown here). The scanner only *uses* it when the chain
 * is in `SCANNER_ENABLED_CHAINS`, so adding the provider never starts live scans.
 */

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const toHexBlock = (n: bigint): string => `0x${n.toString(16)}`;
const addrFromTopic = (topic: string): string => `0x${topic.slice(26)}`; // last 20 bytes

interface RpcBlock {
  number: string;
  hash: string;
}

interface RpcLog {
  transactionHash: string;
  logIndex: string;
  blockNumber: string;
  blockHash: string;
  address: string;
  topics: string[];
  data: string;
}

export function createLiveEvmProvider(deps: { chain: string; rpcUrl?: string | null }): EvmProvider {
  const chain = deps.chain.toUpperCase();
  if (!deps.rpcUrl) {
    // Fail loud: live mode requires an RPC URL (config validation).
    throw new Error(`${chain}_PROVIDER=live requires ${chain === 'BSC' ? 'BSC' : 'ETH'}_RPC_URL`);
  }
  const rpc: JsonRpcClient = createJsonRpcClient(deps.rpcUrl);

  async function blockByTag(tag: string): Promise<BlockRef | null> {
    const block = await rpc.call<RpcBlock | null>('eth_getBlockByNumber', [tag, false]);
    if (!block?.hash || block.number == null) return null;
    return { number: BigInt(block.number), hash: block.hash };
  }

  return {
    name: `evm-live:${chain}`,
    chain,
    mode: 'live',

    async getLatestBlock(): Promise<BlockRef> {
      const head = await blockByTag('latest');
      if (!head) throw new Error('EVM node returned no latest block');
      return head;
    },

    getBlock(blockNumber: bigint): Promise<BlockRef | null> {
      if (blockNumber < 0n) return Promise.resolve(null);
      return blockByTag(toHexBlock(blockNumber));
    },

    async getTokenTransfers(input: GetTransfersInput): Promise<TokenTransfer[]> {
      const logs = await rpc.call<RpcLog[]>('eth_getLogs', [
        {
          address: input.contract,
          fromBlock: toHexBlock(input.fromBlock),
          toBlock: toHexBlock(input.toBlock),
          topics: [TRANSFER_TOPIC],
        },
      ]);
      return logs
        .filter((l) => l.topics.length >= 3)
        .map((l) => ({
          txHash: l.transactionHash,
          logIndex: Number(BigInt(l.logIndex)),
          from: addrFromTopic(l.topics[1]),
          to: addrFromTopic(l.topics[2]),
          contract: l.address,
          // ERC20 value is a uint256 in the data field; base units, never a float.
          amountBase: BigInt(l.data === '0x' ? '0x0' : l.data).toString(),
          blockNumber: BigInt(l.blockNumber),
          blockHash: l.blockHash,
        }));
    },
  };
}
