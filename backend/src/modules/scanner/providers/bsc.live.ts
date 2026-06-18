import type { BlockRef, GetTransfersInput, TokenTransfer, BscProvider } from './bsc.provider';

interface RpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: any[];
  id: number;
}

interface RpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  blockHash: string;
  logIndex: string;
}

interface EvmBlock {
  number: string;
  hash: string;
}

export function createLiveBscProvider(opts: { rpcUrl: string }): BscProvider {
  const { rpcUrl } = opts;
  let requestId = 1;

  async function callRpc<T>(method: string, params: any[]): Promise<T> {
    const id = requestId++;
    const payload: RpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`BSC RPC HTTP error ${response.status}: ${response.statusText}`);
    }

    const json = (await response.json()) as RpcResponse<T>;
    if (json.error) {
      throw new Error(`BSC RPC Error [${json.error.code}]: ${json.error.message}`);
    }

    if (json.result === undefined) {
      throw new Error(`BSC RPC Error: result is undefined`);
    }

    return json.result;
  }

  function toHex(n: bigint): string {
    return '0x' + n.toString(16);
  }

  function parseEvmAddress(topic: string): string {
    // EVM address in topics is padded to 32 bytes (64 hex characters)
    // format: 0x000000000000000000000000 + 40-char hex address
    return '0x' + topic.slice(26).toLowerCase();
  }

  return {
    name: 'bsc-live',
    mode: 'live',

    async getLatestBlock(): Promise<BlockRef> {
      const hexNum = await callRpc<string>('eth_blockNumber', []);
      const num = BigInt(hexNum);
      const block = await callRpc<EvmBlock>('eth_getBlockByNumber', [hexNum, false]);
      return {
        number: num,
        hash: block.hash,
      };
    },

    async getBlock(blockNumber: bigint): Promise<BlockRef | null> {
      try {
        const hexNum = toHex(blockNumber);
        const block = await callRpc<EvmBlock | null>('eth_getBlockByNumber', [hexNum, false]);
        if (!block) return null;
        return {
          number: blockNumber,
          hash: block.hash,
        };
      } catch {
        return null;
      }
    },

    async getTokenTransfers(input: GetTransfersInput): Promise<TokenTransfer[]> {
      const logs = await callRpc<EvmLog[]>('eth_getLogs', [
        {
          address: input.contract,
          fromBlock: toHex(input.fromBlock),
          toBlock: toHex(input.toBlock),
          topics: [
            // Transfer event topic0 signature: Transfer(address,address,uint256)
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        },
      ]);

      return logs.map((log) => {
        // topics[1] = indexed 'from' address
        // topics[2] = indexed 'to' address
        const from = log.topics[1] ? parseEvmAddress(log.topics[1]) : '0x0000000000000000000000000000000000000000';
        const to = log.topics[2] ? parseEvmAddress(log.topics[2]) : '0x0000000000000000000000000000000000000000';
        const amountBase = BigInt(log.data).toString();

        return {
          txHash: log.transactionHash,
          logIndex: parseInt(log.logIndex, 16),
          from,
          to,
          contract: log.address.toLowerCase(),
          amountBase,
          blockNumber: BigInt(log.blockNumber),
          blockHash: log.blockHash,
        };
      });
    },
  };
}
