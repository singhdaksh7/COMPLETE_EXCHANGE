import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { logger } from '../../../lib/logger';
import type {
  CandleQuery,
  MarketCandle,
  MarketDataProvider,
  MarketTicker,
  ProviderHealth,
} from '../market-data.types';

/**
 * CoinGecko Demo API — USDT/INR REFERENCE provider (Goal 4).
 *
 * Backend-only (never called from frontend/mobile). Conservative polling —
 * default every 5 minutes, well inside the Demo tier's free monthly
 * allowance — with the last-known-good value retained across failures and an
 * explicit `stale` verdict rather than ever fabricating a price.
 *
 * FAIL CLOSED: with no `COINGECKO_DEMO_API_KEY` configured this provider
 * starts in `unavailable` mode and never calls the network. It does not
 * fabricate a key or fall back to the Pro endpoint.
 */

const COIN_ID = 'tether';
const VS_CURRENCY = 'inr';
const PRICE_PRECISION = 4;

const priceResponseSchema = z.object({
  [COIN_ID]: z.object({
    [VS_CURRENCY]: z.number(),
    last_updated_at: z.number().optional(),
  }),
});

export function createCoinGeckoProvider(deps: {
  apiBase: string;
  apiKey: string | null;
  pollMs: number;
  staleMs: number;
}): MarketDataProvider {
  const bus = new EventEmitter();
  bus.setMaxListeners(20);

  let latestTicker: MarketTicker | null = null;
  let lastSuccessAt: number | null = null;
  let lastError: string | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let stopped = true;

  async function poll(): Promise<void> {
    if (!deps.apiKey) return; // fail-closed guard; should never be scheduled without a key.
    try {
      const url = `${deps.apiBase}/simple/price?ids=${COIN_ID}&vs_currencies=${VS_CURRENCY}&include_last_updated_at=true`;
      const res = await fetch(url, {
        headers: { 'x-cg-demo-api-key': deps.apiKey },
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        if (res.status === 429) {
          logger.warn('coingecko: rate limited / quota exceeded — keeping last-known-good value');
        } else {
          logger.warn({ status: res.status }, 'coingecko: request failed — keeping last-known-good value');
        }
        return;
      }
      const json = await res.json();
      const parsed = priceResponseSchema.safeParse(json);
      if (!parsed.success) {
        lastError = 'malformed response';
        logger.warn({ issues: parsed.error.issues }, 'coingecko: malformed price response, ignoring');
        return;
      }
      const entry = parsed.data[COIN_ID];
      const sourceTimestamp = entry.last_updated_at ? entry.last_updated_at * 1000 : Date.now();
      latestTicker = {
        symbol: 'USDTINR',
        baseAsset: 'USDT',
        quoteAsset: 'INR',
        price: entry[VS_CURRENCY].toFixed(PRICE_PRECISION),
        source: 'COINGECKO',
        sourceTimestamp,
        receivedAt: Date.now(),
      };
      lastSuccessAt = Date.now();
      lastError = null;
      bus.emit('ticker', latestTicker);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, 'coingecko: network error — keeping last-known-good value');
    }
  }

  return {
    name: 'COINGECKO',

    supportsSymbol(symbol: string): boolean {
      return symbol === 'USDTINR';
    },

    async start(): Promise<void> {
      stopped = false;
      if (!deps.apiKey) {
        logger.warn(
          'coingecko: COINGECKO_DEMO_API_KEY not set — USDTINR market data stays unavailable (fail closed, no fabricated price)',
        );
        return;
      }
      await poll();
      pollTimer = setInterval(() => void poll(), deps.pollMs);
      pollTimer.unref();
    },

    async stop(): Promise<void> {
      stopped = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },

    getLatestTicker(symbol: string): MarketTicker | null {
      return symbol === 'USDTINR' ? latestTicker : null;
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getCandles(_symbol: string, _query: CandleQuery): Promise<MarketCandle[]> {
      // USDT/INR is a REFERENCE symbol (Goal 5) — no OHLC history is served
      // for it; market-data.service returns a clear UNSUPPORTED response
      // before this would even be called for a chart request.
      return [];
    },

    getHealth(): ProviderHealth {
      if (!deps.apiKey) {
        return {
          provider: 'COINGECKO',
          mode: 'unavailable',
          connected: false,
          lastMessageAt: null,
          stale: true,
          detail: 'COINGECKO_DEMO_API_KEY not configured',
        };
      }
      const stale = lastSuccessAt === null || Date.now() - lastSuccessAt > deps.staleMs;
      return {
        provider: 'COINGECKO',
        mode: 'live',
        connected: !stopped && lastSuccessAt !== null,
        lastMessageAt: lastSuccessAt,
        stale,
        detail: lastError ?? undefined,
      };
    },

    onTicker(cb: (ticker: MarketTicker) => void): void {
      bus.on('ticker', cb);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onCandle(_cb: (candle: MarketCandle) => void): void {
      // No candle stream for a reference-only symbol.
    },
  };
}
