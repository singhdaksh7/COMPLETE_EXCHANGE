import { config } from '../../../config';
import { mockPriceProvider } from './price.mock';
import type { PriceProvider } from './price.provider';

let cached: PriceProvider | undefined;

/**
 * Resolve the active price provider.
 *
 * Defaults to the offline mock. 'live' (e.g. a KuCoin feed) is intentionally NOT
 * implemented yet — selecting it fails loudly rather than silently connecting to
 * an external exchange. This enforces "use mock price provider; do not connect
 * to KuCoin yet".
 */
export function getPriceProvider(): PriceProvider {
  if (cached) return cached;
  if (config.conversion.priceProvider === 'live') {
    throw new Error('Live price provider is not implemented; set PRICE_PROVIDER=mock');
  }
  cached = mockPriceProvider;
  return cached;
}

/** Test helper: drop the memoized provider so config changes take effect. */
export function resetPriceProvider(): void {
  cached = undefined;
}

export type { PriceProvider, MidPrice, MidPriceInput } from './price.provider';
