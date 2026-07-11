import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();

vi.mock('../../src/lib/redis', () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
  },
}));

import { redis } from '../../src/lib/redis';
import {
  cacheLatestCandle,
  cacheProviderHealth,
  cacheTicker,
  candleKey,
  providerHealthKey,
  readCachedLatestCandle,
  readCachedProviderHealth,
  readCachedTicker,
  tickerKey,
} from '../../src/modules/market-data/market-data.cache';
import type { MarketCandle, MarketTicker, ProviderHealth } from '../../src/modules/market-data/market-data.types';

const redisMock = vi.mocked(redis);

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

const ticker: MarketTicker = {
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  price: '68000.00',
  source: 'BINANCE',
  sourceTimestamp: 1_000,
  receivedAt: 1_000,
};

describe('market-data.cache', () => {
  it('uses the Goal 6 key conventions', () => {
    expect(tickerKey('BTCUSDT')).toBe('market:ticker:BTCUSDT');
    expect(candleKey('BTCUSDT', '1')).toBe('market:candle:BTCUSDT:1');
    expect(providerHealthKey('BINANCE')).toBe('market:provider:BINANCE:health');
  });

  it('round-trips a ticker through the cache', async () => {
    await cacheTicker(ticker);
    const read = await readCachedTicker('BTCUSDT');
    expect(read).toEqual(ticker);
  });

  it('returns null (never throws) for a cache miss', async () => {
    expect(await readCachedTicker('ETHUSDT')).toBeNull();
  });

  it('round-trips provider health', async () => {
    const health: ProviderHealth = {
      provider: 'BINANCE',
      mode: 'live',
      connected: true,
      lastMessageAt: 1_000,
      stale: false,
    };
    await cacheProviderHealth(health);
    expect(await readCachedProviderHealth('BINANCE')).toEqual(health);
  });

  it('rejects an out-of-order candle update (never lets an older bar overwrite a newer one)', async () => {
    const newer: MarketCandle = {
      symbol: 'BTCUSDT',
      resolution: '1',
      time: 2_000,
      open: '1',
      high: '2',
      low: '1',
      close: '2',
      volume: '5',
      source: 'BINANCE',
    };
    const older: MarketCandle = { ...newer, time: 1_000, close: '999' };

    await cacheLatestCandle(newer);
    await cacheLatestCandle(older); // must be ignored — it is older than what's cached
    const read = await readCachedLatestCandle('BTCUSDT', '1');
    expect(read?.time).toBe(2_000);
    expect(read?.close).toBe('2');
  });

  it('accepts a same-timestamp update (an in-progress candle being revised)', async () => {
    const forming: MarketCandle = {
      symbol: 'BTCUSDT',
      resolution: '1',
      time: 1_000,
      open: '1',
      high: '2',
      low: '1',
      close: '1.5',
      volume: '3',
      source: 'BINANCE',
    };
    await cacheLatestCandle(forming);
    await cacheLatestCandle({ ...forming, close: '1.9', volume: '4' });
    const read = await readCachedLatestCandle('BTCUSDT', '1');
    expect(read?.close).toBe('1.9');
  });

  it('degrades to a safe null instead of throwing when Redis is unavailable', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(readCachedTicker('BTCUSDT')).resolves.toBeNull();

    redisMock.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(cacheTicker(ticker)).resolves.toBeUndefined();
  });
});
