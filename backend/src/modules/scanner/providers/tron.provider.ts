/**
 * TRON chain RPC provider abstraction.
 *
 * A `ChainProvider` specialised for TRON (TRC20). It keeps the original
 * `getTrc20Transfers` method (back-compat with existing callers/tests) and also
 * satisfies the generic `getTokenTransfers` used by the multi-chain scanner.
 * READ-ONLY: it fetches block heads + TRC20 Transfer events; it never holds keys
 * and never broadcasts. Money crosses as integer base-unit strings, never floats.
 */
import type { ChainProvider, GetTransfersInput, TokenTransfer } from './chain.provider';

export type { BlockRef, GetTransfersInput } from './chain.provider';

/** A single TRC20 `Transfer(from,to,value)` event (alias of the generic shape). */
export type Trc20Transfer = TokenTransfer;

export interface TronProvider extends ChainProvider {
  readonly chain: 'TRON';

  /** TRC20 Transfer events for a contract across an inclusive block range. */
  getTrc20Transfers(input: GetTransfersInput): Promise<Trc20Transfer[]>;
}
