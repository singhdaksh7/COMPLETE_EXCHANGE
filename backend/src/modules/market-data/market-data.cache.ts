import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import type {
  CandleResolution,
  MarketCandle,
  MarketTicker,
  ProviderHealth,
} from './market-data.types';

/**
 * Redis market-data cache (Goal 6).
 *
 * Reuses the existing shared `redis` client — no separate deployment. Keys
 * are generous-TTL (so a value is never silently dropped mid-outage); the
 * STALE verdict is computed at READ time by the service layer comparing
 * `receivedAt`/`sourceTimestamp` against a threshold, not by key expiry. This
 * matches Goal 6's "retain last-known-good value ... mark stale after a
 * defined threshold" requirement — an expired key would look identical to
 * "never had data", which is a different (worse) client-facing state.
 *
 * Every read/write is wrapped so a Redis outage degrades to the in-memory
 * provider fallback (`market-data.service.ts`) instead of throwing — per
 * Goal 13 "Redis temporarily unavailable ... fallback behavior".
 */

const TICKER_TTL_SEC = 60 * 60; // 1h — generous; staleness is threshold-based, not TTL-based.
const CANDLE_TTL_SEC = 60 * 60;
const HEALTH_TTL_SEC = 60 * 10;

export function tickerKey(symbol: string): string {
  return `market:ticker:${symbol}`;
}

export function candleKey(symbol: string, resolution: CandleResolution): string {
  return `market:candle:${symbol}:${resolution}`;
}

export function providerHealthKey(provider: string): string {
  return `market:provider:${provider}:health`;
}

export async function cacheTicker(ticker: MarketTicker): Promise<void> {
  try {
    await redis.set(tickerKey(ticker.symbol), JSON.stringify(ticker), 'EX', TICKER_TTL_SEC);
  } catch (err) {
    logger.warn({ err, symbol: ticker.symbol }, 'market-data: ticker cache write failed');
  }
}

export async function readCachedTicker(symbol: string): Promise<MarketTicker | null> {
  try {
    const raw = await redis.get(tickerKey(symbol));
    return raw ? (JSON.parse(raw) as MarketTicker) : null;
  } catch (err) {
    logger.warn({ err, symbol }, 'market-data: ticker cache read failed');
    return null;
  }
}

/** Stores only the latest (currently forming) candle for a symbol/resolution —
 * historical ranges are served straight from the provider, never cached here. */
export async function cacheLatestCandle(candle: MarketCandle): Promise<void> {
  try {
    const key = candleKey(candle.symbol, candle.resolution);
    const existingRaw = await redis.get(key);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as MarketCandle;
      // Out-of-order guard: never let an older bar overwrite a newer one.
      if (existing.time > candle.time) return;
    }
    await redis.set(key, JSON.stringify(candle), 'EX', CANDLE_TTL_SEC);
  } catch (err) {
    logger.warn(
      { err, symbol: candle.symbol, resolution: candle.resolution },
      'market-data: candle cache write failed',
    );
  }
}

export async function readCachedLatestCandle(
  symbol: string,
  resolution: CandleResolution,
): Promise<MarketCandle | null> {
  try {
    const raw = await redis.get(candleKey(symbol, resolution));
    return raw ? (JSON.parse(raw) as MarketCandle) : null;
  } catch (err) {
    logger.warn({ err, symbol, resolution }, 'market-data: candle cache read failed');
    return null;
  }
}

export async function cacheProviderHealth(health: ProviderHealth): Promise<void> {
  try {
    await redis.set(
      providerHealthKey(health.provider),
      JSON.stringify(health),
      'EX',
      HEALTH_TTL_SEC,
    );
  } catch (err) {
    logger.warn({ err, provider: health.provider }, 'market-data: health cache write failed');
  }
}

export async function readCachedProviderHealth(
  provider: string,
): Promise<ProviderHealth | null> {
  try {
    const raw = await redis.get(providerHealthKey(provider));
    return raw ? (JSON.parse(raw) as ProviderHealth) : null;
  } catch (err) {
    logger.warn({ err, provider }, 'market-data: health cache read failed');
    return null;
  }
}
