import { logger } from '../../lib/logger';
import { NotFoundError, ServiceUnavailableError } from '../../lib/errors';
import {
  cacheLatestCandle,
  cacheProviderHealth,
  cacheTicker,
  readCachedLatestCandle,
  readCachedProviderHealth,
  readCachedTicker,
} from './market-data.cache';
import { getSymbolMeta, listSymbolMeta, type SymbolMeta } from './symbol-registry';
import { getBinanceProvider, getCoinGeckoProvider, listProviders, providerForSource } from './providers';
import { publishMarketCandle, publishMarketTicker } from '../../realtime/events';
import type {
  CandleQuery,
  MarketCandle,
  MarketCandleDto,
  MarketTicker,
  MarketTickerDto,
  ProviderHealth,
} from './market-data.types';

/**
 * Market-data orchestration (Goals 6-9 glue).
 *
 * Routes every symbol to its owning provider (per the symbol registry),
 * fans provider events out to the Redis cache + realtime socket layer, and
 * is the ONLY place that computes the read-time `stale` verdict. Never
 * touches the ledger, matching engine, or the internal `trading` module.
 */

export type TickerLookup =
  | { available: true; ticker: MarketTickerDto }
  | { available: false; symbol: string; reason: string };

export type CandlesLookup =
  | { available: true; symbol: string; resolution: CandleQuery['resolution']; candles: MarketCandleDto[] }
  | { available: false; symbol: string; reason: string };

function staleThresholdMs(meta: SymbolMeta): number {
  // Kept local to avoid a config import cycle; mirrors config/index.ts.
  return meta.marketDataSource === 'BINANCE' ? BINANCE_STALE_MS : COINGECKO_STALE_MS;
}

// Populated from config at bootstrap via configureStaleThresholds(); default
// to safe (generous) values so unit tests that don't call configure() still work.
let BINANCE_STALE_MS = 15_000;
let COINGECKO_STALE_MS = 900_000;

export function configureStaleThresholds(input: { binanceMs: number; coingeckoMs: number }): void {
  BINANCE_STALE_MS = input.binanceMs;
  COINGECKO_STALE_MS = input.coingeckoMs;
}

function toTickerDto(ticker: MarketTicker, meta: SymbolMeta): MarketTickerDto {
  const stale = Date.now() - ticker.receivedAt > staleThresholdMs(meta);
  return { ...ticker, stale };
}

function toCandleDto(candle: MarketCandle, meta: SymbolMeta): MarketCandleDto {
  // A historical bar is "stale" only in the sense that the CURRENT bucket is
  // still forming and hasn't received an update recently; closed buckets are
  // never stale by definition.
  const stale = false;
  void meta;
  return { ...candle, stale };
}

let started = false;

export const marketDataService = {
  listSymbols(): SymbolMeta[] {
    return listSymbolMeta();
  },

  /** Start all providers and wire their events into cache + realtime fan-out.
   * Idempotent — safe to call once at boot. */
  async start(): Promise<void> {
    if (started) return;
    started = true;

    for (const provider of listProviders()) {
      provider.onTicker((ticker) => {
        void cacheTicker(ticker);
        const meta = getSymbolMeta(ticker.symbol);
        if (meta) publishMarketTicker(toTickerDto(ticker, meta));
      });
      provider.onCandle((candle) => {
        void cacheLatestCandle(candle);
        const meta = getSymbolMeta(candle.symbol);
        if (meta) publishMarketCandle(toCandleDto(candle, meta));
      });
    }

    await Promise.all(
      listProviders().map(async (provider) => {
        try {
          await provider.start();
        } catch (err) {
          logger.error({ err, provider: provider.name }, 'market-data: provider failed to start');
        }
      }),
    );

    // Periodically snapshot provider health into Redis for the /market-data/health endpoint.
    const healthTimer = setInterval(() => {
      for (const provider of listProviders()) {
        void cacheProviderHealth(provider.getHealth());
      }
    }, 10_000);
    healthTimer.unref();
  },

  async stop(): Promise<void> {
    if (!started) return;
    started = false;
    await Promise.all(listProviders().map((p) => p.stop()));
  },

  async getTicker(symbol: string): Promise<TickerLookup> {
    const meta = getSymbolMeta(symbol);
    if (!meta) throw new NotFoundError('Unsupported symbol', 'SYMBOL_NOT_FOUND');

    const cached = await readCachedTicker(symbol);
    const provider = providerForSource(meta.marketDataSource);
    const raw = cached ?? provider.getLatestTicker(symbol);

    if (!raw) {
      return {
        available: false,
        symbol,
        reason:
          meta.marketDataSource === 'COINGECKO' && provider.getHealth().mode === 'unavailable'
            ? 'USDT/INR reference price is not configured (CoinGecko key pending)'
            : 'No price received yet',
      };
    }
    return { available: true, ticker: toTickerDto(raw, meta) };
  },

  async listTickers(): Promise<TickerLookup[]> {
    return Promise.all(listSymbolMeta().map((meta) => this.getTicker(meta.symbol)));
  },

  async getCandles(symbol: string, query: CandleQuery): Promise<CandlesLookup> {
    const meta = getSymbolMeta(symbol);
    if (!meta) throw new NotFoundError('Unsupported symbol', 'SYMBOL_NOT_FOUND');

    if (meta.marketDataType === 'REFERENCE') {
      return {
        available: false,
        symbol,
        reason: 'Historical candles are not available for reference-only symbols',
      };
    }

    const provider = providerForSource(meta.marketDataSource);
    let candles: MarketCandle[];
    try {
      candles = await provider.getCandles(symbol, query);
    } catch (err) {
      logger.error({ err, symbol, provider: provider.name }, 'market-data: candle fetch failed');
      throw new ServiceUnavailableError(`${provider.name} market data is temporarily unavailable`);
    }

    // Merge in the in-memory "current" forming candle if it's newer than the
    // last historical bar returned (keeps the chart's rightmost bar live).
    const latestCached = await readCachedLatestCandle(symbol, query.resolution);
    const dtos = candles.map((c) => toCandleDto(c, meta));
    if (latestCached && (dtos.length === 0 || latestCached.time > dtos[dtos.length - 1].time)) {
      dtos.push(toCandleDto(latestCached, meta));
    }

    return { available: true, symbol, resolution: query.resolution, candles: dtos };
  },

  async getProviderHealth(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];
    for (const provider of [getBinanceProvider(), getCoinGeckoProvider()]) {
      const cached = await readCachedProviderHealth(provider.name);
      results.push(cached ?? provider.getHealth());
    }
    return results;
  },
};

export type MarketDataService = typeof marketDataService;
