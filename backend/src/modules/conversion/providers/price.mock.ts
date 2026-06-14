import { config } from '../../../config';
import type { MidPrice, MidPriceInput, PriceProvider } from './price.provider';

/**
 * Mock price provider.
 *
 * Fully offline and deterministic: returns the configured USDT/INR mid price
 * (a decimal string) with NO network calls. This is the platform-liquidity
 * pricing model — we do not connect to KuCoin or any order book here.
 */
export const mockPriceProvider: PriceProvider = {
  name: 'price-mock',
  mode: 'mock',

  async getMidPrice(input: MidPriceInput): Promise<MidPrice> {
    const base = input.base.toUpperCase();
    const quote = input.quote.toUpperCase();
    if (base === 'USDT' && quote === 'INR') {
      return { base, quote, price: config.conversion.mockUsdtInr };
    }
    throw new Error(`Mock price not available for ${base}/${quote}`);
  },
};
