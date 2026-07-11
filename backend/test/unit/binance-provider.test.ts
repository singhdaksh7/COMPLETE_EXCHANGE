import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBinanceProvider } from '../../src/modules/market-data/providers/binance.provider';

function klineRow(openTime: number, close: string): unknown[] {
  return [openTime, '100.00', '101.00', '99.00', close, '10.5', openTime + 59_999];
}

describe('binance market-data provider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function makeProvider() {
    return createBinanceProvider({
      restBase: 'https://data-api.binance.vision',
      wsBase: 'wss://data-stream.binance.vision',
      staleMs: 15_000,
    });
  }

  it('only supports the Binance-owned allowlist (BTC/ETH/BNB), never an arbitrary symbol', () => {
    const provider = makeProvider();
    expect(provider.supportsSymbol('BTCUSDT')).toBe(true);
    expect(provider.supportsSymbol('ETHUSDT')).toBe(true);
    expect(provider.supportsSymbol('BNBUSDT')).toBe(true);
    expect(provider.supportsSymbol('USDTINR')).toBe(false); // CoinGecko's symbol
    expect(provider.supportsSymbol('DOGEUSDT')).toBe(false); // not in the registry at all
  });

  it('reports stale/disconnected health before any WS message has ever arrived', () => {
    const provider = makeProvider();
    const health = provider.getHealth();
    expect(health.provider).toBe('BINANCE');
    expect(health.connected).toBe(false);
    expect(health.stale).toBe(true);
    expect(health.lastMessageAt).toBeNull();
  });

  it('getLatestTicker returns null before any data has been received (never fabricates a price)', () => {
    const provider = makeProvider();
    expect(provider.getLatestTicker('BTCUSDT')).toBeNull();
  });

  it('getCandles maps EXORA resolutions onto the correct Binance kline interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [klineRow(1_000, '105.00')],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = makeProvider();
    await provider.getCandles('BTCUSDT', { resolution: '240' });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('interval=4h');
    expect(calledUrl).toContain('symbol=BTCUSDT');
  });

  it('getCandles returns bars sorted ascending with duplicate timestamps collapsed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      // Out of order + a duplicate open time (simulating a re-delivered bar).
      json: async () => [
        klineRow(3_000, '103.00'),
        klineRow(1_000, '101.00'),
        klineRow(1_000, '101.50'), // duplicate timestamp — last one wins, no dup entries
        klineRow(2_000, '102.00'),
      ],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = makeProvider();
    const candles = await provider.getCandles('BTCUSDT', { resolution: '1' });

    expect(candles.map((c) => c.time)).toEqual([1_000, 2_000, 3_000]);
    expect(candles.find((c) => c.time === 1_000)?.close).toBe('101.50');
    expect(candles.every((c) => c.source === 'BINANCE')).toBe(true);
  });

  it('getCandles for a symbol Binance does not own returns an empty array rather than fabricating data', async () => {
    const provider = makeProvider();
    const candles = await provider.getCandles('USDTINR', { resolution: '1' });
    expect(candles).toEqual([]);
  });
});
