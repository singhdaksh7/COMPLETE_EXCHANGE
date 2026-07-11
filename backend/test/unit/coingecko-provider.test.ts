import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCoinGeckoProvider } from '../../src/modules/market-data/providers/coingecko.provider';

const BASE_DEPS = {
  apiBase: 'https://api.coingecko.com/api/v3',
  pollMs: 300_000,
  staleMs: 900_000,
};

describe('coingecko USDT/INR reference provider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fails closed when no API key is configured: never polls, never fabricates a price', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = createCoinGeckoProvider({ ...BASE_DEPS, apiKey: null });
    await provider.start();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.getLatestTicker('USDTINR')).toBeNull();
    expect(provider.getHealth().mode).toBe('unavailable');
    expect(provider.getHealth().stale).toBe(true);

    await provider.stop();
  });

  it('only ever answers for USDTINR, never another symbol', () => {
    const provider = createCoinGeckoProvider({ ...BASE_DEPS, apiKey: 'test-key' });
    expect(provider.supportsSymbol('USDTINR')).toBe(true);
    expect(provider.supportsSymbol('BTCUSDT')).toBe(false);
  });

  it('normalizes a successful Demo API response into a MarketTicker', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tether: { inr: 89.1234, last_updated_at: 1_700_000_000 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = createCoinGeckoProvider({ ...BASE_DEPS, apiKey: 'test-key' });
    await provider.start();
    await provider.stop(); // stop immediately after the initial poll so no interval lingers

    const ticker = provider.getLatestTicker('USDTINR');
    expect(ticker).not.toBeNull();
    expect(ticker?.symbol).toBe('USDTINR');
    expect(ticker?.price).toBe('89.1234');
    expect(ticker?.source).toBe('COINGECKO');
    expect(ticker?.sourceTimestamp).toBe(1_700_000_000_000);

    const [, requestInit] = fetchMock.mock.calls[0];
    expect((requestInit as { headers: Record<string, string> }).headers['x-cg-demo-api-key']).toBe('test-key');
  });

  it('keeps the last-known-good price on a 429 rate-limit / quota response instead of clearing it', async () => {
    const provider = createCoinGeckoProvider({ ...BASE_DEPS, apiKey: 'test-key' });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tether: { inr: 90, last_updated_at: 1_700_000_000 } }),
    }) as unknown as typeof fetch;
    await provider.start();
    await provider.stop();
    const goodTicker = provider.getLatestTicker('USDTINR');
    expect(goodTicker?.price).toBe('90.0000');

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;
    // Re-create is not possible (would reset state); simulate a second poll by
    // re-starting with the same provider instance is not exposed, so instead
    // verify the provider never nulls out latest ticker state internally by
    // re-invoking start() (idempotent poll-once path) and confirming the
    // stale last-known-good value survives.
    await provider.start();
    await provider.stop();
    expect(provider.getLatestTicker('USDTINR')?.price).toBe('90.0000');
  });

  it('ignores a malformed response body without throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'shape' }),
    }) as unknown as typeof fetch;

    const provider = createCoinGeckoProvider({ ...BASE_DEPS, apiKey: 'test-key' });
    await expect(provider.start()).resolves.not.toThrow();
    await provider.stop();
    expect(provider.getLatestTicker('USDTINR')).toBeNull();
  });
});
