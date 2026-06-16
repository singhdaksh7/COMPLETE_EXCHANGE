import { logger } from '../../../lib/logger';
import { ServiceUnavailableError } from '../../../lib/errors';
import type {
  BlockRef,
  GetTransfersInput,
  Trc20Transfer,
  TronProvider,
} from './tron.provider';

/**
 * Live TronGrid-backed provider.
 *
 * Constructed ONLY by the resolver after it has confirmed an API key exists, so
 * this code assumes `apiKey` is present. It is read-only chain access over HTTPS
 * (no keys held, no broadcasts). Kept intentionally small; the scanner never
 * calls it in tests (which always use the mock).
 */
export function createLiveTronProvider(deps: {
  apiKey: string;
  apiBase: string;
}): TronProvider {
  const headers = {
    'TRON-PRO-API-KEY': deps.apiKey,
    'Content-Type': 'application/json',
  };

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${deps.apiBase}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      logger.error({ err, path }, 'TronGrid request failed');
      throw new ServiceUnavailableError('TRON node is unavailable');
    }
    if (!res.ok) {
      logger.error({ status: res.status, path }, 'TronGrid returned an error');
      throw new ServiceUnavailableError('TRON node returned an error');
    }
    return (await res.json()) as T;
  }

  async function trc20Transfers(input: GetTransfersInput): Promise<Trc20Transfer[]> {
    // TronGrid exposes contract event logs; a production implementation would
    // page the event endpoint and map results. Left as a typed stub because
    // live scanning requires real credentials and is never run in tests.
    throw new ServiceUnavailableError(
      `Live TRC20 transfer scanning is not implemented (contract ${input.contract})`,
    );
  }

  return {
    name: 'tron-live',
    chain: 'TRON',
    mode: 'live',

    async getLatestBlock(): Promise<BlockRef> {
      const block = await postJson<{
        block_header: { raw_data: { number: number } };
        blockID: string;
      }>('/wallet/getnowblock', {});
      return {
        number: BigInt(block.block_header.raw_data.number),
        hash: block.blockID,
      };
    },

    async getBlock(blockNumber: bigint): Promise<BlockRef | null> {
      const block = await postJson<{
        block_header?: { raw_data: { number: number } };
        blockID?: string;
      }>('/wallet/getblockbynum', { num: Number(blockNumber) });
      if (!block?.blockID || !block.block_header) return null;
      return {
        number: BigInt(block.block_header.raw_data.number),
        hash: block.blockID,
      };
    },

    getTokenTransfers: trc20Transfers,
    getTrc20Transfers: trc20Transfers,
  };
}
