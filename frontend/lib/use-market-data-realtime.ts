'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Envelope } from './api';
import { getSocket } from './socket';
import { tokenStore } from './auth';
import type { MarketDataCandle, MarketDataTicker, MarketDataTickerLookup } from './types';

/**
 * Subscribe to EXORA's live market-data stream (Goal 9/11) for a set of
 * canonical no-dash symbols (e.g. `BTCUSDT`) and push updates straight into
 * the React Query cache backing `marketDataTickers`/`marketDataTicker`.
 *
 * Falls back to REST polling (handled by the caller's `refetchInterval`)
 * whenever the socket is disconnected — this hook only reports `connected`.
 *
 * Intended to be mounted exactly ONCE, by `MarketDataProvider` (see
 * `market-data-context.tsx`) — subscribing from more than one place at a time
 * causes one consumer's unmount to `md:unsubscribe` symbols another consumer
 * still needs. `pathname` is re-read on every navigation (login redirects via
 * `router.replace`, which does not remount the root providers) so a token
 * that appears after login is picked up without a page reload.
 */

interface TickerSocketPayload {
  type: 'ticker';
  symbol: string;
  data: Omit<MarketDataTicker, 'symbol' | 'baseAsset' | 'quoteAsset' | 'receivedAt'>;
}

interface CandleSocketPayload {
  type: 'candle';
  symbol: string;
  resolution: MarketDataCandle['resolution'];
  data: Pick<MarketDataCandle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'>;
}

export function useMarketDataRealtime(symbols: string[]): { connected: boolean } {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const key = symbols.join(',');
  const pathname = usePathname();

  useEffect(() => {
    const token = tokenStore.getUserAccess();
    if (!token || symbols.length === 0) return;

    const socket = getSocket(token);

    const onConnect = (): void => {
      setConnected(true);
      for (const symbol of symbols) socket.emit('md:subscribe', symbol);
    };
    const onDisconnect = (): void => setConnected(false);

    const onTicker = (payload: TickerSocketPayload): void => {
      if (!symbols.includes(payload.symbol)) return;
      qc.setQueryData<Envelope<{ items: MarketDataTickerLookup[] }>>(
        ['market-data-tickers'],
        (old) => {
          if (!old?.data?.items) return old;
          const items = old.data.items.map((row) => {
            if (row.available && row.ticker.symbol === payload.symbol) {
              return { available: true as const, ticker: { ...row.ticker, ...payload.data, symbol: payload.symbol } };
            }
            return row;
          });
          return { ...old, data: { ...old.data, items } };
        },
      );
      qc.setQueryData<Envelope<MarketDataTickerLookup>>(
        ['market-data-ticker', payload.symbol],
        (old) => {
          if (!old?.data?.available) return old;
          return { ...old, data: { available: true, ticker: { ...old.data.ticker, ...payload.data, symbol: payload.symbol } } };
        },
      );
    };

    const onCandle = (payload: CandleSocketPayload): void => {
      if (!symbols.includes(payload.symbol)) return;
      void qc.invalidateQueries({ queryKey: ['market-data-candles', payload.symbol, payload.resolution] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('ticker', onTicker);
    socket.on('candle', onCandle);

    if (socket.connected) onConnect();

    return () => {
      for (const symbol of symbols) socket.emit('md:unsubscribe', symbol);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('ticker', onTicker);
      socket.off('candle', onCandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, qc, pathname]);

  return { connected };
}
