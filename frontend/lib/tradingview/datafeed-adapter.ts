import { userApi } from '@/lib/user-api';
import { getSocket } from '@/lib/socket';
import { tokenStore } from '@/lib/auth';
import { MARKET_DATA_RESOLUTIONS, type MarketDataResolution } from '@/lib/types';

/**
 * TradingView Advanced Charts Datafeed adapter (Goal 10).
 *
 * IMPORTANT: the TradingView Advanced Charts library itself is licensed and
 * is NOT in this repository. Nothing in this file was copied from that
 * library — the interfaces below are minimal LOCAL stand-ins for the subset
 * of the publicly-documented Datafeed API surface this adapter implements
 * (method names: onReady/searchSymbols/resolveSymbol/getBars/subscribeBars/
 * unsubscribeBars). When the operator supplies the authorized
 * `charting_library` package, replace these local types with its real
 * `IBasicDataFeed`/`LibrarySymbolInfo`/`Bar` types — the method bodies below
 * should not need to change, since they only depend on EXORA's own
 * `/market-data` REST + realtime API, documented in
 * `docs/market-data/tradingview-datafeed-mapping.md`.
 *
 * Do not wire this into a page until the real library is present — it is
 * dead code (unused adapter) until then, by design.
 */

export interface DatafeedConfiguration {
  supported_resolutions: string[];
  supports_marks: boolean;
  supports_time: boolean;
  exchanges: Array<{ value: string; name: string; desc: string }>;
}

export interface LibrarySymbolInfo {
  name: string;
  full_name: string;
  ticker: string;
  description: string;
  type: string;
  exchange: string;
  listed_exchange: string;
  session: string;
  timezone: string;
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  intraday_multipliers: string[];
  supported_resolutions: string[];
  volume_precision: number;
  data_status: 'streaming' | 'endofday' | 'pulsed' | 'delayed_streaming';
}

export interface Bar {
  time: number; // ms epoch, per TradingView's JS Datafeed contract
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PeriodParams {
  from: number; // seconds
  to: number; // seconds
  countBack: number;
  firstDataRequest: boolean;
}

export interface SearchSymbolResultItem {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  ticker: string;
  type: string;
}

const EXCHANGE_NAME = 'EXORA';

function toLibrarySymbolInfo(
  meta: { symbol: string; displaySymbol: string; baseAsset: string; quoteAsset: string; pricePrecision: number },
): LibrarySymbolInfo {
  return {
    name: meta.symbol,
    full_name: `${EXCHANGE_NAME}:${meta.symbol}`,
    ticker: meta.symbol,
    description: meta.displaySymbol,
    type: 'crypto',
    exchange: EXCHANGE_NAME,
    listed_exchange: EXCHANGE_NAME,
    session: '24x7',
    timezone: 'Etc/UTC',
    minmov: 1,
    pricescale: 10 ** meta.pricePrecision,
    has_intraday: true,
    intraday_multipliers: ['1', '5', '15', '30', '60', '240'],
    supported_resolutions: [...MARKET_DATA_RESOLUTIONS],
    volume_precision: 2,
    data_status: 'streaming',
  };
}

/** TradingView resolution strings ('1','5','15','30','60','240','1D') map
 * 1:1 onto EXORA's `CandleResolution` — chosen deliberately for this. */
function toCandleResolution(resolution: string): MarketDataResolution | null {
  return (MARKET_DATA_RESOLUTIONS as readonly string[]).includes(resolution)
    ? (resolution as MarketDataResolution)
    : null;
}

type SubscribeListener = (bar: Bar) => void;
const activeSubscriptions = new Map<string, { symbol: string; resolution: MarketDataResolution; onTick: SubscribeListener }>();
let socketWired = false;

function wireSocketOnce(): void {
  if (socketWired) return;
  const token = tokenStore.getUserAccess();
  if (!token) return;
  const socket = getSocket(token);
  socket.on('candle', (payload: { symbol: string; resolution: string; data: { time: number; open: string; high: string; low: string; close: string; volume: string } }) => {
    for (const sub of activeSubscriptions.values()) {
      if (sub.symbol !== payload.symbol || sub.resolution !== payload.resolution) continue;
      sub.onTick({
        time: payload.data.time,
        open: Number(payload.data.open),
        high: Number(payload.data.high),
        low: Number(payload.data.low),
        close: Number(payload.data.close),
        volume: Number(payload.data.volume),
      });
    }
  });
  socketWired = true;
}

/**
 * Goal 10 mapping (documented in full in
 * docs/market-data/tradingview-datafeed-mapping.md):
 *
 *   onReady        -> GET /market-data (symbol registry) for supported resolutions
 *   searchSymbols   -> filters the same registry client-side (only 4 symbols)
 *   resolveSymbol   -> GET /market-data (symbol registry), by symbol
 *   getBars         -> GET /market-data/:symbol/candles (historical)
 *   subscribeBars   -> `candle` events on the existing Socket.IO connection,
 *                      subscribed via `md:subscribe`
 *   unsubscribeBars -> `md:unsubscribe`
 */
export const exoraDatafeed = {
  onReady(callback: (config: DatafeedConfiguration) => void): void {
    setTimeout(() => {
      callback({
        supported_resolutions: [...MARKET_DATA_RESOLUTIONS],
        supports_marks: false,
        supports_time: true,
        exchanges: [{ value: EXCHANGE_NAME, name: EXCHANGE_NAME, desc: 'EXORA live reference prices' }],
      });
    }, 0);
  },

  async searchSymbols(
    userInput: string,
    _exchange: string,
    _symbolType: string,
    onResult: (items: SearchSymbolResultItem[]) => void,
  ): Promise<void> {
    const res = await userApi.marketDataSymbols();
    const term = userInput.trim().toUpperCase();
    const items = res.data.items
      .filter((m) => !term || m.symbol.includes(term) || m.displaySymbol.toUpperCase().includes(term))
      .map((m) => ({
        symbol: m.symbol,
        full_name: `${EXCHANGE_NAME}:${m.symbol}`,
        description: m.displaySymbol,
        exchange: EXCHANGE_NAME,
        ticker: m.symbol,
        type: 'crypto',
      }));
    onResult(items);
  },

  async resolveSymbol(
    symbolName: string,
    onResolve: (info: LibrarySymbolInfo) => void,
    onError: (reason: string) => void,
  ): Promise<void> {
    const bareSymbol = symbolName.includes(':') ? symbolName.split(':')[1] : symbolName;
    const res = await userApi.marketDataSymbols();
    const meta = res.data.items.find((m) => m.symbol === bareSymbol);
    if (!meta) {
      onError('unknown_symbol');
      return;
    }
    onResolve(toLibrarySymbolInfo(meta));
  },

  async getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    periodParams: PeriodParams,
    onResult: (bars: Bar[], meta: { noData: boolean }) => void,
    onError: (reason: string) => void,
  ): Promise<void> {
    const candleResolution = toCandleResolution(resolution);
    if (!candleResolution) {
      onError('unsupported_resolution');
      return;
    }
    try {
      const limit = Math.min(Math.max(periodParams.countBack, 1), 1000);
      const res = await userApi.marketDataCandles(symbolInfo.ticker, candleResolution, limit);
      if (!res.data.available) {
        onResult([], { noData: true });
        return;
      }
      const bars: Bar[] = res.data.candles.map((c) => ({
        time: c.time,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      }));
      onResult(bars, { noData: bars.length === 0 });
    } catch {
      onError('EXORA market-data request failed');
    }
  },

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    onTick: SubscribeListener,
    listenerGuid: string,
  ): void {
    const candleResolution = toCandleResolution(resolution);
    if (!candleResolution) return;
    wireSocketOnce();
    const token = tokenStore.getUserAccess();
    if (token) getSocket(token).emit('md:subscribe', symbolInfo.ticker);
    activeSubscriptions.set(listenerGuid, { symbol: symbolInfo.ticker, resolution: candleResolution, onTick });
  },

  unsubscribeBars(listenerGuid: string): void {
    const sub = activeSubscriptions.get(listenerGuid);
    if (!sub) return;
    activeSubscriptions.delete(listenerGuid);
    // Only unsubscribe the room if nothing else still wants that symbol.
    const stillNeeded = Array.from(activeSubscriptions.values()).some((s) => s.symbol === sub.symbol);
    if (!stillNeeded) {
      const token = tokenStore.getUserAccess();
      if (token) getSocket(token).emit('md:unsubscribe', sub.symbol);
    }
  },
};
