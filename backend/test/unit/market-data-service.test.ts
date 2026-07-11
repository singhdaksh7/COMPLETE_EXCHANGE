import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MarketDataProvider, MarketTicker } from '../../src/modules/market-data/market-data.types';

vi.mock('../../src/modules/market-data/market-data.cache', () => ({
  cacheTicker: vi.fn().mockResolvedValue(undefined),
  cacheLatestCandle: vi.fn().mockResolvedValue(undefined),
  cacheProviderHealth: vi.fn().mockResolvedValue(undefined),
  readCachedTicker: vi.fn().mockResolvedValue(null),
  readCachedLatestCandle: vi.fn().mockResolvedValue(null),
  readCachedProviderHealth: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/realtime/events', () => ({
  publishMarketTicker: vi.fn(),
  publishMarketCandle: vi.fn(),
}));

function fakeProvider(name: 'BINANCE' | 'COINGECKO'): MarketDataProvider {
  return {
    name,
    supportsSymbol: vi.fn().mockReturnValue(true),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getLatestTicker: vi.fn().mockReturnValue(null),
    getCandles: vi.fn().mockResolvedValue([]),
    getHealth: vi.fn().mockReturnValue({
      provider: name,
      mode: name === 'COINGECKO' ? 'unavailable' : 'live',
      connected: false,
      lastMessageAt: null,
      stale: true,
    }),
    onTicker: vi.fn(),
    onCandle: vi.fn(),
  };
}

const binanceProvider = fakeProvider('BINANCE');
const coingeckoProvider = fakeProvider('COINGECKO');

vi.mock('../../src/modules/market-data/providers', () => ({
  getBinanceProvider: () => binanceProvider,
  getCoinGeckoProvider: () => coingeckoProvider,
  listProviders: () => [binanceProvider, coingeckoProvider],
  providerForSource: (source: 'BINANCE' | 'COINGECKO') =>
    source === 'BINANCE' ? binanceProvider : coingeckoProvider,
}));

import { readCachedTicker } from '../../src/modules/market-data/market-data.cache';
import {
  configureStaleThresholds,
  marketDataService,
} from '../../src/modules/market-data/market-data.service';
import { NotFoundError, ServiceUnavailableError } from '../../src/lib/errors';

const readCachedTickerMock = vi.mocked(readCachedTicker);

beforeEach(() => {
  vi.clearAllMocks();
  configureStaleThresholds({ binanceMs: 15_000, coingeckoMs: 900_000 });
  binanceProvider.getLatestTicker = vi.fn().mockReturnValue(null);
  binanceProvider.getCandles = vi.fn().mockResolvedValue([]);
  coingeckoProvider.getLatestTicker = vi.fn().mockReturnValue(null);
});

describe('market-data.service', () => {
  it('rejects an unsupported symbol', async () => {
    await expect(marketDataService.getTicker('DOGEUSDT')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reports unavailable (never fabricated) when neither cache nor provider has data yet', async () => {
    const result = await marketDataService.getTicker('BTCUSDT');
    expect(result.available).toBe(false);
  });

  it('gives a specific reason when USDTINR has no CoinGecko key configured', async () => {
    const result = await marketDataService.getTicker('USDTINR');
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toMatch(/CoinGecko key pending/);
  });

  it('falls back to the provider in-memory ticker when Redis has no cached value', async () => {
    const raw: MarketTicker = {
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      price: '68000.00',
      source: 'BINANCE',
      sourceTimestamp: Date.now(),
      receivedAt: Date.now(),
    };
    binanceProvider.getLatestTicker = vi.fn().mockReturnValue(raw);

    const result = await marketDataService.getTicker('BTCUSDT');
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.ticker.stale).toBe(false);
      // Never leaks fields beyond the documented normalized ticker + stale flag.
      expect(Object.keys(result.ticker).sort()).toEqual(
        ['symbol', 'baseAsset', 'quoteAsset', 'price', 'source', 'sourceTimestamp', 'receivedAt', 'stale'].sort(),
      );
    }
  });

  it('marks a ticker stale once it exceeds the source-specific threshold', async () => {
    const old: MarketTicker = {
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      price: '68000.00',
      source: 'BINANCE',
      sourceTimestamp: Date.now() - 60_000,
      receivedAt: Date.now() - 60_000, // well past the 15s Binance threshold
    };
    readCachedTickerMock.mockResolvedValueOnce(old);

    const result = await marketDataService.getTicker('BTCUSDT');
    expect(result.available).toBe(true);
    if (result.available) expect(result.ticker.stale).toBe(true);
  });

  it('refuses historical candles for a REFERENCE-only symbol (USDTINR)', async () => {
    const result = await marketDataService.getCandles('USDTINR', { resolution: '1' });
    expect(result.available).toBe(false);
  });

  it('rejects an unsupported symbol for candles', async () => {
    await expect(marketDataService.getCandles('DOGEUSDT', { resolution: '1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('surfaces a provider failure as a clean ServiceUnavailableError, never a crash', async () => {
    binanceProvider.getCandles = vi.fn().mockRejectedValue(new Error('Binance is down'));
    await expect(marketDataService.getCandles('BTCUSDT', { resolution: '1' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it('returns candles in ascending order for a valid tradable symbol', async () => {
    binanceProvider.getCandles = vi.fn().mockResolvedValue([
      { symbol: 'BTCUSDT', resolution: '1', time: 1_000, open: '1', high: '2', low: '1', close: '2', volume: '5', source: 'BINANCE' },
      { symbol: 'BTCUSDT', resolution: '1', time: 2_000, open: '2', high: '3', low: '2', close: '3', volume: '6', source: 'BINANCE' },
    ]);
    const result = await marketDataService.getCandles('BTCUSDT', { resolution: '1' });
    expect(result.available).toBe(true);
    if (result.available) expect(result.candles.map((c) => c.time)).toEqual([1_000, 2_000]);
  });
});
