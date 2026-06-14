'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Envelope } from './api';
import { getSocket } from './socket';
import { tokenStore } from './auth';
import type { Order, OrderBook, Page, Wallet, WalletOverview } from './types';

/**
 * Subscribe the /trade view to live exchange updates over Socket.IO and push
 * them straight into the React Query cache, so the order book, open orders,
 * recent trades and balances refresh without polling.
 *
 * Returns `connected`: when false the caller re-enables REST polling as a
 * fallback (the socket auto-reconnects in the background).
 */

const OPEN_STATUSES = ['PENDING', 'OPEN', 'PARTIALLY_FILLED'];

interface BalancePush {
  balances: Wallet[];
}

export function useRealtime(symbol: string): { connected: boolean } {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = tokenStore.getUserAccess();
    if (!token) return;

    const socket = getSocket(token);
    const room = `market:${symbol}`;

    const onConnect = (): void => {
      setConnected(true);
      socket.emit('subscribe', room);
    };
    const onDisconnect = (): void => setConnected(false);

    // Order book: full snapshot pushed by the server — replace the cache.
    const onOrderbook = (book: OrderBook): void => {
      if (book.symbol !== symbol) return;
      qc.setQueryData<Envelope<OrderBook>>(['orderbook', symbol], {
        success: true,
        data: book,
      });
    };

    // Market tape moved → refresh the viewer's own trade list AND the public
    // chart data (ticker + candles) so the price/last/volume update live.
    const onTrade = (): void => {
      void qc.invalidateQueries({ queryKey: ['trades'] });
      void qc.invalidateQueries({ queryKey: ['ticker'] });
      void qc.invalidateQueries({ queryKey: ['candles'] });
    };

    // The viewer's own order changed: upsert it into every open-orders cache,
    // or drop it when it reaches a terminal state.
    const onOrderUpdated = (order: Order): void => {
      qc.setQueriesData<Envelope<Page<Order>>>({ queryKey: ['open-orders'] }, (old) => {
        if (!old?.data?.items) return old;
        const rest = old.data.items.filter((o) => o.id !== order.id);
        const items = OPEN_STATUSES.includes(order.status) ? [order, ...rest] : rest;
        return { ...old, data: { ...old.data, items } };
      });
      void qc.invalidateQueries({ queryKey: ['trades'] });
    };

    // Balances: merge the pushed snapshot, preserving the `assets` field other
    // views rely on. Fall back to a refetch if nothing is cached yet.
    const onBalance = (payload: BalancePush): void => {
      const cached = qc.getQueryData<Envelope<WalletOverview>>(['wallet-overview']);
      if (cached?.data) {
        qc.setQueryData<Envelope<WalletOverview>>(['wallet-overview'], {
          ...cached,
          data: { ...cached.data, balances: payload.balances },
        });
      } else {
        void qc.invalidateQueries({ queryKey: ['wallet-overview'] });
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('orderbook.updated', onOrderbook);
    socket.on('trade.executed', onTrade);
    socket.on('order.updated', onOrderUpdated);
    socket.on('balance.updated', onBalance);

    // Already connected (singleton survived a previous mount)? Sync now.
    if (socket.connected) onConnect();

    return () => {
      socket.emit('unsubscribe', room);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('orderbook.updated', onOrderbook);
      socket.off('trade.executed', onTrade);
      socket.off('order.updated', onOrderUpdated);
      socket.off('balance.updated', onBalance);
    };
  }, [symbol, qc]);

  return { connected };
}
