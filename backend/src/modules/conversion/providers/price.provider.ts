/**
 * Price provider abstraction.
 *
 * The seam between the conversion module and a source of market prices. Today
 * only an offline deterministic mock exists; a real provider (an exchange feed
 * such as KuCoin) is a FUTURE task and is intentionally not wired here.
 *
 * Prices cross this boundary as DECIMAL STRINGS (never JS floats). The returned
 * `price` is the mid-market quote-per-base — e.g. INR per 1 USDT for
 * { base: 'USDT', quote: 'INR' }. The platform spread is applied by the service,
 * not the provider.
 */
export interface MidPriceInput {
  base: string;
  quote: string;
}

export interface MidPrice {
  base: string;
  quote: string;
  /** Mid-market price: units of `quote` per 1 `base`, decimal string. */
  price: string;
}

export interface PriceProvider {
  readonly name: string;
  readonly mode: 'mock' | 'live';
  getMidPrice(input: MidPriceInput): Promise<MidPrice>;
}
