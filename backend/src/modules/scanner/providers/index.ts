import { config } from '../../../config';
import { createMockTronProvider } from './tron.mock';
import { createLiveTronProvider } from './tron.live';
import type { TronProvider } from './tron.provider';

let cached: TronProvider | undefined;

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
  if (cached) return cached;

  if (config.scanner.tronProvider === 'live') {
    if (!config.scanner.tronGridApiKey) {
      throw new Error('TRON_PROVIDER=live requires TRONGRID_API_KEY');
    }
    cached = createLiveTronProvider({
      apiKey: config.scanner.tronGridApiKey,
      apiBase: config.scanner.tronGridApiBase,
    });
    return cached;
  }

  cached = createMockTronProvider();
  return cached;
}

/** Test helper: drop the memoized provider so config changes take effect. */
export function resetTronProvider(): void {
  cached = undefined;
}

export type {
  TronProvider,
  BlockRef,
  Trc20Transfer,
  GetTransfersInput,
} from './tron.provider';
export { createMockTronProvider } from './tron.mock';
export type { MockTronProvider } from './tron.mock';
