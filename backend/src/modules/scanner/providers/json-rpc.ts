import { logger } from '../../../lib/logger';
import { ServiceUnavailableError } from '../../../lib/errors';

/**
 * Minimal read-only JSON-RPC client (EVM nodes).
 *
 * Used by the live EVM providers to fetch chain data over HTTPS. It is strictly
 * READ-ONLY — it only ever issues `eth_*` query methods, never `eth_sendRawTransaction`
 * or any signing/broadcast call. No keys cross this boundary.
 */
export interface JsonRpcClient {
  readonly url: string;
  call<T>(method: string, params: unknown[]): Promise<T>;
}

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export function createJsonRpcClient(url: string): JsonRpcClient {
  let id = 0;
  return {
    url,
    async call<T>(method: string, params: unknown[]): Promise<T> {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: (id += 1), method, params }),
        });
      } catch (err) {
        logger.error({ err, method }, 'EVM JSON-RPC request failed');
        throw new ServiceUnavailableError('EVM node is unavailable');
      }
      if (!res.ok) {
        logger.error({ status: res.status, method }, 'EVM JSON-RPC returned an error');
        throw new ServiceUnavailableError('EVM node returned an error');
      }
      const body = (await res.json()) as RpcResponse<T>;
      if (body.error) {
        logger.error({ method, rpcError: body.error }, 'EVM JSON-RPC error payload');
        throw new ServiceUnavailableError(`EVM RPC error: ${body.error.message}`);
      }
      return body.result as T;
    },
  };
}
