/**
 * Provider-neutral market-data contracts (Stage: market-data foundation).
 *
 * These types are the ONLY shapes that cross the module boundary — providers
 * (Binance, CoinGecko) normalize into these, and the public API/realtime
 * stream never leaks a raw provider payload. All prices are decimal STRINGS,
 * never JS floats, matching the rest of the platform's money convention.
 *
 * This module is READ-ONLY market data. It does not place orders, does not
 * touch the ledger, and is entirely separate from the internal USDT-INR
 * spot-trading market in `modules/trading` (which is order-book-derived and
 * keeps its own dash-separated symbol format, e.g. `USDT-INR`). Canonical
 * symbols here are the no-dash form (`BTCUSDT`, `USDTINR`) so the two
 * resource spaces never collide.
 */

export type MarketDataSourceName = 'BINANCE' | 'COINGECKO';

/** Resolutions accepted by the historical candle API — chosen to map cleanly
 * onto TradingView Advanced Charts resolutions later (Goal 10). */
export const CANDLE_RESOLUTIONS = ['1', '5', '15', '30', '60', '240', '1D'] as const;
export type CandleResolution = (typeof CANDLE_RESOLUTIONS)[number];

export function isCandleResolution(value: string): value is CandleResolution {
  return (CANDLE_RESOLUTIONS as readonly string[]).includes(value);
}

export interface MarketTicker {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: string;
  bid?: string;
  ask?: string;
  high24h?: string;
  low24h?: string;
  volume24h?: string;
  change24hPercent?: string;
  source: string;
  sourceTimestamp: number;
  receivedAt: number;
}

export interface MarketCandle {
  symbol: string;
  resolution: CandleResolution;
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  source: string;
}

/** Ticker/candle enriched with the read-time staleness verdict. Only this
 * shape (never the raw cached one) is returned across the API/socket. */
export interface MarketTickerDto extends MarketTicker {
  stale: boolean;
}

export interface MarketCandleDto extends MarketCandle {
  stale: boolean;
}

export interface ProviderHealth {
  provider: MarketDataSourceName;
  mode: 'live' | 'unavailable';
  connected: boolean;
  lastMessageAt: number | null;
  stale: boolean;
  detail?: string;
}

export interface CandleQuery {
  resolution: CandleResolution;
  from?: number;
  to?: number;
  limit?: number;
}

/**
 * Provider-neutral market-data abstraction (Goal 2). A provider owns exactly
 * the symbols it is responsible for (per the symbol registry's
 * `marketDataSource`) and never fabricates a value for a symbol it doesn't
 * own — `market-data.service.ts` routes by symbol and never asks a provider
 * for something outside its allowlist.
 */
export interface MarketDataProvider {
  readonly name: MarketDataSourceName;

  supportsSymbol(symbol: string): boolean;

  /** Begin live updates (WS connect / poll loop). Idempotent. */
  start(): Promise<void>;

  /** Stop cleanly — closes sockets/timers. Idempotent. */
  stop(): Promise<void>;

  /** Best-effort latest ticker straight from provider memory (no I/O). Used
   * as the Redis-unavailable fallback. Null if never received one yet. */
  getLatestTicker(symbol: string): MarketTicker | null;

  /** Historical candles, ascending by time, no duplicate timestamps. */
  getCandles(symbol: string, query: CandleQuery): Promise<MarketCandle[]>;

  getHealth(): ProviderHealth;

  onTicker(cb: (ticker: MarketTicker) => void): void;
  onCandle(cb: (candle: MarketCandle) => void): void;
}
