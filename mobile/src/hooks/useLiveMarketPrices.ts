import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { userApi } from '@/api/userApi';
import type { MarketDataTickerLookup } from '@/types/api';

/**
 * Live reference prices (Goal 12) — BTC/USDT, ETH/USDT, BNB/USDT, USDT/INR.
 *
 * Mobile has no realtime socket infra today (every other mobile screen is
 * REST + `useApi`), so this stays consistent with that pattern: a bounded
 * poll loop rather than introducing a new socket.io-client dependency/
 * connection lifecycle. Foreground resync (Goal 12) is handled via
 * `AppState` — a backgrounded app stops polling and refetches immediately
 * the moment it returns to the foreground, instead of showing a stale price
 * that silently aged while the app was suspended.
 */
const POLL_MS = 15_000;

interface State {
  items: MarketDataTickerLookup[];
  loading: boolean;
  error: string | null;
}

export function useLiveMarketPrices(): State & { reload: () => void } {
  const [state, setState] = useState<State>({ items: [], loading: true, error: null });
  const mounted = useRef(true);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await userApi.marketDataTickers();
      if (mounted.current) setState({ items: res.data.items, loading: false, error: null });
    } catch (err) {
      if (mounted.current) {
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Unavailable' }));
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void fetchOnce();

    let interval: ReturnType<typeof setInterval> | null = setInterval(() => void fetchOnce(), POLL_MS);

    const onAppStateChange = (next: AppStateStatus): void => {
      if (next === 'active') {
        void fetchOnce();
        if (!interval) interval = setInterval(() => void fetchOnce(), POLL_MS);
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      mounted.current = false;
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, [fetchOnce]);

  return { ...state, reload: () => void fetchOnce() };
}
