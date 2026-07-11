import type { MarketDataSourceName } from './market-data.types';

/**
 * Canonical EXORA market-data symbol registry (Goal 5).
 *
 * The single source of truth for which symbols the market-data foundation
 * serves, which upstream provider owns each, and the display/precision
 * metadata the frontend/mobile/TradingView adapter all read from. Adding a
 * symbol here is the ONLY way to make it visible anywhere in this module —
 * providers refuse to subscribe to/serve anything absent from this map.
 *
 * `marketDataType`:
 *   - 'TRADABLE_REFERENCE' — a live market price shown for information; the
 *     asset itself is NOT tradable on EXORA today (crypto execution is off).
 *   - 'REFERENCE' — USDT/INR: an FX-style reference rate, never executable.
 *
 * Visibility here is READ-ONLY market data. It has no bearing on order
 * placement, which remains governed entirely by the existing `trading`
 * module and its own `Market` table / feature flags.
 */
export interface SymbolMeta {
  symbol: string;
  displaySymbol: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  status: 'ACTIVE';
  marketDataSource: MarketDataSourceName;
  marketDataType: 'TRADABLE_REFERENCE' | 'REFERENCE';
}

export const SYMBOL_REGISTRY: Readonly<Record<string, SymbolMeta>> = {
  BTCUSDT: {
    symbol: 'BTCUSDT',
    displaySymbol: 'BTC/USDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    pricePrecision: 2,
    quantityPrecision: 6,
    status: 'ACTIVE',
    marketDataSource: 'BINANCE',
    marketDataType: 'TRADABLE_REFERENCE',
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    displaySymbol: 'ETH/USDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    pricePrecision: 2,
    quantityPrecision: 6,
    status: 'ACTIVE',
    marketDataSource: 'BINANCE',
    marketDataType: 'TRADABLE_REFERENCE',
  },
  BNBUSDT: {
    symbol: 'BNBUSDT',
    displaySymbol: 'BNB/USDT',
    baseAsset: 'BNB',
    quoteAsset: 'USDT',
    pricePrecision: 2,
    quantityPrecision: 4,
    status: 'ACTIVE',
    marketDataSource: 'BINANCE',
    marketDataType: 'TRADABLE_REFERENCE',
  },
  USDTINR: {
    symbol: 'USDTINR',
    displaySymbol: 'USDT/INR',
    baseAsset: 'USDT',
    quoteAsset: 'INR',
    pricePrecision: 4,
    quantityPrecision: 2,
    status: 'ACTIVE',
    marketDataSource: 'COINGECKO',
    marketDataType: 'REFERENCE',
  },
} as const;

export const SUPPORTED_SYMBOLS: readonly string[] = Object.keys(SYMBOL_REGISTRY);

export function isSupportedSymbol(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(SYMBOL_REGISTRY, symbol);
}

export function getSymbolMeta(symbol: string): SymbolMeta | null {
  return SYMBOL_REGISTRY[symbol] ?? null;
}

export function listSymbolMeta(): SymbolMeta[] {
  return Object.values(SYMBOL_REGISTRY);
}

export function symbolsForSource(source: MarketDataSourceName): string[] {
  return listSymbolMeta()
    .filter((m) => m.marketDataSource === source)
    .map((m) => m.symbol);
}
