'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userApi } from './user-api';
import { useMarketDataRealtime } from './use-market-data-realtime';
import type { MarketDataTickerLookup } from './types';

/**
 * Single shared live market-data source for the whole app: one REST snapshot
 * query + one Socket.IO subscription, mounted once at the root (see
 * `app/providers.tsx`) so every consumer (global header ticker, Markets page
 * live cards, future trading page) reads the same cache instead of each
 * opening its own polling loop / `md:subscribe` lifecycle. See
 * `use-market-data-realtime.ts` for why a single subscriber matters.
 */
const ALL_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'USDTINR'];

interface MarketDataContextValue {
  tickers: MarketDataTickerLookup[];
  bySymbol: Record<string, MarketDataTickerLookup>;
  connected: boolean;
  isLoading: boolean;
  isError: boolean;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const q = useQuery({
    queryKey: ['market-data-tickers'],
    queryFn: () => userApi.marketDataTickers(),
    // REST fallback cadence — the socket subscription below supersedes this
    // whenever connected, matching the existing per-page behavior it replaces.
    refetchInterval: 15_000,
  });

  const { connected } = useMarketDataRealtime(ALL_SYMBOLS);

  const tickers = q.data?.data.items ?? [];
  const bySymbol = useMemo(() => {
    const map: Record<string, MarketDataTickerLookup> = {};
    for (const row of tickers) {
      map[row.available ? row.ticker.symbol : row.symbol] = row;
    }
    return map;
  }, [tickers]);

  const value: MarketDataContextValue = {
    tickers,
    bySymbol,
    connected,
    isLoading: q.isLoading,
    isError: q.isError,
  };

  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>;
}

/** Read the shared live market-data snapshot. Must be used under `MarketDataProvider`. */
export function useMarketData(): MarketDataContextValue {
  const ctx = useContext(MarketDataContext);
  if (!ctx) {
    throw new Error('useMarketData must be used within MarketDataProvider');
  }
  return ctx;
}
