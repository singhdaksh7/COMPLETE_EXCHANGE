import type { ChainProvider } from './chain.provider';

/**
 * EVM chain provider (Ethereum / BSC — ERC20 / BEP20 USDT).
 *
 * Structurally identical to the generic `ChainProvider` (ERC20 and BEP20 emit
 * the same `Transfer(address,address,uint256)` event TRC20 does), so the
 * multi-chain scanner treats every chain uniformly. This marker interface
 * exists for clarity and to anchor EVM-specific test controls on the mock.
 */
export type EvmProvider = ChainProvider;
