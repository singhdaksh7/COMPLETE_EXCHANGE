import { config } from '../../../config';
import { createMockTronProvider } from './tron.mock';
import { createLiveTronProvider } from './tron.live';
import { createMockBscProvider } from './bsc.mock';
import { createLiveBscProvider } from './bsc.live';
import type { TronProvider } from './tron.provider';
import type { BscProvider } from './bsc.provider';

let cachedTron: TronProvider | undefined;
let cachedBsc: BscProvider | undefined;

/**
 * Resolve the active TRON provider.
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
 * Resolve the active BSC provider.
 */
export function getBscProvider(): BscProvider {
  if (cachedBsc) return cachedBsc;

  if (config.scanner.bscProvider === 'live') {
    if (!config.scanner.bscTestnetRpcUrl) {
      throw new Error('BSC_PROVIDER=live requires BSC_TESTNET_RPC_URL');
    }
    cachedBsc = createLiveBscProvider({
      rpcUrl: config.scanner.bscTestnetRpcUrl,
    });
    return cachedBsc;
  }

  cachedBsc = createMockBscProvider();
  return cachedBsc;
}

/** Test helper: drop the memoized provider so config changes take effect. */
export function resetTronProvider(): void {
  cachedTron = undefined;
}

export function resetBscProvider(): void {
  cachedBsc = undefined;
}

export type {
  TronProvider,
  BlockRef,
  Trc20Transfer,
  GetTransfersInput,
} from './tron.provider';

export type {
  BscProvider,
} from './bsc.provider';

export type {
  TokenTransfer,
} from './provider.types';
