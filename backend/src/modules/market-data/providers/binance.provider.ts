import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { z } from 'zod';
import { logger } from '../../../lib/logger';
import { getSymbolMeta, symbolsForSource } from '../symbol-registry';
import {
  CANDLE_RESOLUTIONS,
  type CandleQuery,
  type CandleResolution,
  type MarketCandle,
  type MarketDataProvider,
  type MarketTicker,
  type ProviderHealth,
} from '../market-data.types';

/**
 * Binance public MARKET-DATA-ONLY provider (Goal 3).
 *
 * Uses ONLY `data-api.binance.vision` (REST) / `data-stream.binance.vision`
 * (WS) — Binance's dedicated market-data hosts that require no API key and
 * carry no account/trading capability. This file must never import or call
 * a Binance trading, account, or user-data-stream endpoint, and never holds
 * a Binance API key.
 */

// Binance kline interval strings, in the same order as CANDLE_RESOLUTIONS —
// chosen because Binance happens to support exactly this resolution set.
const RESOLUTION_TO_BINANCE_INTERVAL: Record<CandleResolution, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '240': '4h',
  '1D': '1d',
};

const MAX_KLINES_LIMIT = 1000; // Binance's own hard cap per request.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const STALE_WATCHDOG_MS = 5_000;

const ticker24hrSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  bidPrice: z.string().optional(),
  askPrice: z.string().optional(),
  highPrice: z.string(),
  lowPrice: z.string(),
  volume: z.string(),
  priceChangePercent: z.string(),
  closeTime: z.number(),
});

const wsTickerEventSchema = z.object({
  e: z.literal('24hrTicker'),
  s: z.string(),
  c: z.string(), // last price
  b: z.string().optional(),
  a: z.string().optional(),
  h: z.string(),
  l: z.string(),
  v: z.string(),
  P: z.string(), // price change percent
  E: z.number(), // event time
});

const wsKlineEventSchema = z.object({
  e: z.literal('kline'),
  s: z.string(),
  E: z.number(),
  k: z.object({
    t: z.number(), // open time
    o: z.string(),
    h: z.string(),
    l: z.string(),
    c: z.string(),
    v: z.string(),
  }),
});

const combinedStreamEnvelope = z.object({
  stream: z.string(),
  data: z.unknown(),
});

function toTicker(symbol: string, source: {
  price: string;
  bid?: string;
  ask?: string;
  high: string;
  low: string;
  volume: string;
  changePercent: string;
  sourceTimestamp: number;
}): MarketTicker {
  const meta = getSymbolMeta(symbol);
  return {
    symbol,
    baseAsset: meta?.baseAsset ?? symbol.replace('USDT', ''),
    quoteAsset: meta?.quoteAsset ?? 'USDT',
    price: source.price,
    bid: source.bid,
    ask: source.ask,
    high24h: source.high,
    low24h: source.low,
    volume24h: source.volume,
    change24hPercent: source.changePercent,
    source: 'BINANCE',
    sourceTimestamp: source.sourceTimestamp,
    receivedAt: Date.now(),
  };
}

export function createBinanceProvider(deps: {
  restBase: string;
  wsBase: string;
  staleMs: number;
}): MarketDataProvider {
  const symbols = symbolsForSource('BINANCE'); // ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']
  const symbolSet = new Set(symbols);
  const bus = new EventEmitter();
  bus.setMaxListeners(20);

  const latestTickers = new Map<string, MarketTicker>();
  let ws: WebSocket | null = null;
  let manualStop = false;
  let reconnectAttempt = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let watchdogTimer: NodeJS.Timeout | null = null;
  let lastMessageAt: number | null = null;
  let connected = false;

  function streamPath(): string {
    const streams = symbols.flatMap((s) => [
      `${s.toLowerCase()}@ticker`,
      `${s.toLowerCase()}@kline_1m`,
    ]);
    return `/stream?streams=${streams.join('/')}`;
  }

  function scheduleReconnect(): void {
    if (manualStop) return;
    if (reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    const jitter = Math.floor(Math.random() * 250);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay + jitter);
    reconnectTimer.unref();
  }

  function handleTickerEvent(payload: unknown): void {
    const parsed = wsTickerEventSchema.safeParse(payload);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'binance market-data: malformed ticker event');
      return;
    }
    const d = parsed.data;
    if (!symbolSet.has(d.s)) return; // enforce the allowlist even if the stream somehow sends more
    const ticker = toTicker(d.s, {
      price: d.c,
      bid: d.b,
      ask: d.a,
      high: d.h,
      low: d.l,
      volume: d.v,
      changePercent: d.P,
      sourceTimestamp: d.E,
    });
    latestTickers.set(d.s, ticker);
    bus.emit('ticker', ticker);
  }

  function handleKlineEvent(payload: unknown): void {
    const parsed = wsKlineEventSchema.safeParse(payload);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'binance market-data: malformed kline event');
      return;
    }
    const d = parsed.data;
    if (!symbolSet.has(d.s)) return;
    const candle: MarketCandle = {
      symbol: d.s,
      resolution: '1',
      time: d.k.t,
      open: d.k.o,
      high: d.k.h,
      low: d.k.l,
      close: d.k.c,
      volume: d.k.v,
      source: 'BINANCE',
    };
    bus.emit('candle', candle);
  }

  function onMessage(raw: WebSocket.RawData): void {
    lastMessageAt = Date.now();
    let json: unknown;
    try {
      json = JSON.parse(raw.toString());
    } catch (err) {
      logger.warn({ err }, 'binance market-data: non-JSON WS message ignored');
      return;
    }
    const envelope = combinedStreamEnvelope.safeParse(json);
    if (!envelope.success) {
      logger.warn({ issues: envelope.error.issues }, 'binance market-data: unrecognized WS envelope');
      return;
    }
    const { stream, data } = envelope.data;
    if (stream.endsWith('@ticker')) {
      handleTickerEvent(data);
    } else if (stream.includes('@kline_')) {
      handleKlineEvent(data);
    }
    // Any other stream type is silently ignored — we only ever subscribe to
    // @ticker/@kline_1m, so this only fires if Binance changes its contract.
  }

  function connect(): void {
    if (manualStop) return;
    const url = `${deps.wsBase}${streamPath()}`;
    const socket = new WebSocket(url, { handshakeTimeout: 10_000 });
    ws = socket;

    socket.on('open', () => {
      connected = true;
      reconnectAttempt = 0;
      lastMessageAt = Date.now();
      logger.info({ symbols }, 'binance market-data: WS connected');
    });

    // `ws` responds to Binance's server-sent ping frames with a pong
    // automatically at the protocol level (default library behavior) — no
    // application-level heartbeat reply is required. We still bump
    // lastMessageAt on a ping so the staleness watchdog treats it as
    // liveness, since a ping proves the connection is alive even between
    // ticker/kline pushes.
    socket.on('ping', () => {
      lastMessageAt = Date.now();
    });

    socket.on('message', onMessage);

    socket.on('error', (err) => {
      logger.warn({ err }, 'binance market-data: WS error');
    });

    socket.on('close', (code, reasonBuf) => {
      connected = false;
      if (ws === socket) ws = null;
      if (manualStop) return;
      logger.warn(
        { code, reason: reasonBuf.toString() },
        'binance market-data: WS closed, scheduling reconnect',
      );
      scheduleReconnect();
    });
  }

  function startWatchdog(): void {
    watchdogTimer = setInterval(() => {
      if (manualStop) return;
      const stale = lastMessageAt === null || Date.now() - lastMessageAt > deps.staleMs;
      // If the socket claims to be open but we haven't heard from it in well
      // over the stale threshold, treat it as a zombie connection and force
      // a reconnect rather than silently serving stale data forever.
      if (stale && connected && lastMessageAt !== null && Date.now() - lastMessageAt > deps.staleMs * 3) {
        logger.warn('binance market-data: zombie WS detected, forcing reconnect');
        ws?.terminate();
      }
    }, STALE_WATCHDOG_MS);
    watchdogTimer.unref();
  }

  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${deps.restBase}${path}`);
    if (!res.ok) {
      throw new Error(`Binance market-data REST ${path} returned ${res.status}`);
    }
    return (await res.json()) as T;
  }

  return {
    name: 'BINANCE',

    supportsSymbol(symbol: string): boolean {
      return symbolSet.has(symbol);
    },

    async start(): Promise<void> {
      manualStop = false;
      // Bootstrap: seed latestTickers via REST so getTicker has an answer
      // before the first WS push arrives.
      try {
        const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
        const rows = await fetchJson<unknown[]>(
          `/api/v3/ticker/24hr?symbols=${symbolsParam}`,
        );
        for (const row of rows) {
          const parsed = ticker24hrSchema.safeParse(row);
          if (!parsed.success) continue;
          const d = parsed.data;
          if (!symbolSet.has(d.symbol)) continue;
          latestTickers.set(
            d.symbol,
            toTicker(d.symbol, {
              price: d.lastPrice,
              bid: d.bidPrice,
              ask: d.askPrice,
              high: d.highPrice,
              low: d.lowPrice,
              volume: d.volume,
              changePercent: d.priceChangePercent,
              sourceTimestamp: d.closeTime,
            }),
          );
        }
      } catch (err) {
        logger.warn({ err }, 'binance market-data: REST bootstrap failed, WS will populate state');
      }

      connect();
      startWatchdog();
    },

    async stop(): Promise<void> {
      manualStop = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      if (ws) {
        ws.removeAllListeners();
        ws.close(1000, 'shutdown');
        ws = null;
      }
      connected = false;
    },

    getLatestTicker(symbol: string): MarketTicker | null {
      return latestTickers.get(symbol) ?? null;
    },

    async getCandles(symbol: string, query: CandleQuery): Promise<MarketCandle[]> {
      if (!symbolSet.has(symbol)) return [];
      const interval = RESOLUTION_TO_BINANCE_INTERVAL[query.resolution];
      if (!interval) return [];
      const params = new URLSearchParams({
        symbol,
        interval,
        limit: String(Math.min(query.limit ?? 300, MAX_KLINES_LIMIT)),
      });
      if (query.from) params.set('startTime', String(query.from));
      if (query.to) params.set('endTime', String(query.to));

      const rows = await fetchJson<unknown[][]>(`/api/v3/klines?${params.toString()}`);
      const seen = new Map<number, MarketCandle>();
      for (const row of rows) {
        // Kline array shape: [openTime, open, high, low, close, volume, closeTime, ...]
        const [openTime, open, high, low, close, volume] = row as [
          number,
          string,
          string,
          string,
          string,
          string,
          ...unknown[],
        ];
        if (typeof openTime !== 'number') continue;
        seen.set(openTime, {
          symbol,
          resolution: query.resolution,
          time: openTime,
          open,
          high,
          low,
          close,
          volume,
          source: 'BINANCE',
        });
      }
      // De-duplicated by time (Map key) and sorted ascending — satisfies
      // "no duplicate timestamps" / "ascending timestamp order" (Goal 7).
      return Array.from(seen.values()).sort((a, b) => a.time - b.time);
    },

    getHealth(): ProviderHealth {
      const stale = lastMessageAt === null || Date.now() - lastMessageAt > deps.staleMs;
      return {
        provider: 'BINANCE',
        mode: 'live',
        connected,
        lastMessageAt,
        stale,
      };
    },

    onTicker(cb: (ticker: MarketTicker) => void): void {
      bus.on('ticker', cb);
    },

    onCandle(cb: (candle: MarketCandle) => void): void {
      bus.on('candle', cb);
    },
  };
}

export { CANDLE_RESOLUTIONS };
