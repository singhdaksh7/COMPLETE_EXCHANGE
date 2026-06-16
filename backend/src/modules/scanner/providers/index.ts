import { config } from '../../../config';
import { createMockTronProvider } from './tron.mock';
import { createLiveTronProvider } from './tron.live';
import { createMockEvmProvider } from './evm.mock';
import { createLiveEvmProvider } from './evm.live';
import type { TronProvider } from './tron.provider';
import type { ChainProvider } from './chain.provider';

let cachedTron: TronProvider | undefined;
const cachedByChain = new Map<string, ChainProvider>();

/**
 * Resolve the active TRON provider.
 *
 * Defaults to the offline mock. The live TronGrid provider is selected ONLY
 * when TRON_PROVIDER=live AND a TRONGRID_API_KEY exists — otherwise we fail
 * loudly rather than silently calling the real network with no/placeholder
 * credentials. This enforces "do not use real TronGrid unless credentials
 * exist; default to mock provider".
 */
export function getTronProvider(): TronProvider {
  if (cachedTron) return cachedTron;

  if (config.scanner.tronProvider === 'live') {
    if (!config.scanner.tronGridApiKey) {
      throw new Error('TRON_PROVIDER=live requires TRONGRID_API_KEY');
    }
    cachedTron = createLiveTronProvider({
      apiKey: config.scanner.tronGridApiKey,
      apiBase: config.scanner.tronGridApiBase,
    });
    return cachedTron;
  }

  cachedTron = createMockTronProvider();
  return cachedTron;
}

/**
 * Resolve a READ-ONLY provider for ANY supported chain (Phase 5.1).
 *
 * - TRON     → the existing TronGrid/mock resolver (behaviour preserved).
 * - ETHEREUM → EVM mock (default). `ETH_PROVIDER=live` is intentionally
 *              UNIMPLEMENTED and throws — we never hit a real RPC yet.
 * - BSC      → EVM mock (default). `BSC_PROVIDER=live` likewise throws.
 *
 * Providers are memoised per chain. Unknown chains throw.
 */
export function getChainProvider(chain: string): ChainProvider {
  const chainId = chain.toUpperCase();
  if (chainId === 'TRON') return getTronProvider();

  const cached = cachedByChain.get(chainId);
  if (cached) return cached;

  if (chainId === 'ETHEREUM' || chainId === 'BSC') {
    // Phase 5.6: in testnet mode, prefer the per-chain testnet RPC and use the
    // live (read-only) EVM provider so the scanner sees real BSC Testnet /
    // Sepolia Transfer events. Falls back to the Phase 5.1/5.2 mainnet-style
    // selection (mock by default) when not on testnet or no testnet RPC is set.
    const testnetRpc =
      chainId === 'ETHEREUM'
        ? config.scanner.ethSepoliaRpcUrl
        : config.scanner.bscTestnetRpcUrl;
    if (config.isTestnet && testnetRpc) {
      const provider = createLiveEvmProvider({ chain: chainId, rpcUrl: testnetRpc });
      cachedByChain.set(chainId, provider);
      return provider;
    }

    const mode = chainId === 'ETHEREUM' ? config.scanner.ethProvider : config.scanner.bscProvider;
    const rpcUrl = chainId === 'ETHEREUM' ? config.scanner.ethRpcUrl : config.scanner.bscRpcUrl;
    // 'live' is READ-ONLY chain access; it requires an RPC URL (config error if
    // missing). The scanner only *uses* it when the chain is enabled, so this
    // never starts a live scan on its own. No signing/broadcast path exists.
    const provider =
      mode === 'live'
        ? createLiveEvmProvider({ chain: chainId, rpcUrl })
        : createMockEvmProvider(chainId);
    cachedByChain.set(chainId, provider);
    return provider;
  }

  throw new Error(`Unsupported chain '${chain}'`);
}

/** Test helper: drop all memoized providers so config/test changes take effect. */
export function resetTronProvider(): void {
  cachedTron = undefined;
  cachedByChain.clear();
}

export type {
  TronProvider,
  BlockRef,
  Trc20Transfer,
  GetTransfersInput,
} from './tron.provider';
export type { ChainProvider, TokenTransfer } from './chain.provider';
export type { EvmProvider } from './evm.provider';
export { createMockTronProvider } from './tron.mock';
export type { MockTronProvider } from './tron.mock';
export { createMockEvmProvider } from './evm.mock';
export type { MockEvmProvider } from './evm.mock';
export { createLiveEvmProvider } from './evm.live';
