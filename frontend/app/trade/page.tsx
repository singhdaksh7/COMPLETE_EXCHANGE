'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useRealtime } from '@/lib/use-realtime';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { MarketChart } from '@/components/market-chart';
import { Card, Alert, Button, Field, Input, Select, StatusBadge } from '@/components/ui';
import type {
  Market,
  Order,
  OrderSide,
  OrderType,
  PlaceOrderInput,
} from '@/lib/types';

const DEFAULT_SYMBOL = 'USDT-INR';

export default function TradePage() {
  return (
    <Suspense fallback={null}>
      <TradeInner />
    </Suspense>
  );
}

function TradeInner() {
  const ready = useGuard('user');
  const router = useRouter();
  const params = useSearchParams();
  const symbol = (params.get('symbol') ?? DEFAULT_SYMBOL).toUpperCase();

  const marketsQ = useQuery({
    queryKey: ['markets'],
    queryFn: () => userApi.listMarkets(),
    enabled: ready,
  });
  const markets = marketsQ.data?.data.items ?? [];
  const market = markets.find((m) => m.symbol === symbol);

  // Live exchange feed. `live` gates per-panel polling: when the socket is
  // connected we rely on pushed updates; when it drops we poll as a fallback.
  const { connected: live } = useRealtime(symbol);

  if (!ready) return null;

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Trade</h1>
            <ConnectionBadge live={live} />
          </div>
          <div className="w-48">
            <Select
              value={symbol}
              onChange={(e) =>
                router.push(`/trade?symbol=${encodeURIComponent(e.target.value)}`)
              }
            >
              {markets.length === 0 && <option value={symbol}>{symbol}</option>}
              {markets.map((m) => (
                <option key={m.symbol} value={m.symbol}>
                  {m.symbol}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {marketsQ.isError && <Alert>{errorMessage(marketsQ.error)}</Alert>}

        <div className="mb-4">
          <MarketChart symbol={symbol} live={live} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <OrderBookPanel symbol={symbol} live={live} />
          </div>
          <div className="lg:col-span-1">
            <OrderForm symbol={symbol} market={market} />
            <div className="mt-4">
              <Balances live={live} />
            </div>
          </div>
          <div className="lg:col-span-1">
            <RecentTrades symbol={symbol} live={live} />
          </div>
        </div>

        <div className="mt-4">
          <OpenOrders symbol={symbol} live={live} />
        </div>
      </main>
    </>
  );
}

function ConnectionBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        live ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      }`}
      title={
        live
          ? 'Live updates over WebSocket'
          : 'Socket disconnected — falling back to polling'
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-green-600' : 'bg-amber-600'}`}
      />
      {live ? 'Live' : 'Polling'}
    </span>
  );
}

function OrderBookPanel({ symbol, live }: { symbol: string; live: boolean }) {
  const q = useQuery({
    queryKey: ['orderbook', symbol],
    queryFn: () => userApi.orderBook(symbol, 15),
    // Live pushes replace polling; poll only as a fallback when disconnected.
    refetchInterval: live ? false : 3000,
  });
  const book = q.data?.data;

  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold">Order book · {symbol}</h2>
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}
      <div className="grid grid-cols-2 gap-1 text-xs font-medium text-gray-500">
        <span>Price (INR)</span>
        <span className="text-right">Qty</span>
      </div>

      <div className="mt-1 space-y-0.5">
        {(book?.asks ?? [])
          .slice()
          .reverse()
          .map((lvl, i) => (
            <div key={`a${i}`} className="grid grid-cols-2 text-xs">
              <span className="font-mono text-red-600">{lvl.price}</span>
              <span className="text-right font-mono">{lvl.quantity}</span>
            </div>
          ))}
      </div>

      <div className="my-1 border-t border-gray-200" />

      <div className="space-y-0.5">
        {(book?.bids ?? []).map((lvl, i) => (
          <div key={`b${i}`} className="grid grid-cols-2 text-xs">
            <span className="font-mono text-green-600">{lvl.price}</span>
            <span className="text-right font-mono">{lvl.quantity}</span>
          </div>
        ))}
      </div>

      {book && book.asks.length === 0 && book.bids.length === 0 && (
        <p className="py-3 text-xs text-gray-500">No resting orders.</p>
      )}
    </Card>
  );
}

function OrderForm({ symbol, market }: { symbol: string; market?: Market }) {
  const qc = useQueryClient();
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<OrderType>('LIMIT');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quoteBudget, setQuoteBudget] = useState('');

  const place = useMutation({
    mutationFn: (body: PlaceOrderInput) => userApi.placeOrder(body),
    onSuccess: () => {
      setPrice('');
      setQuantity('');
      setQuoteBudget('');
      qc.invalidateQueries({ queryKey: ['orderbook', symbol] });
      qc.invalidateQueries({ queryKey: ['open-orders'] });
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const base: PlaceOrderInput = { symbol, side, type };
    if (type === 'LIMIT') {
      base.price = price.trim();
      base.quantity = quantity.trim();
    } else if (side === 'BUY') {
      base.quoteBudget = quoteBudget.trim();
    } else {
      base.quantity = quantity.trim();
    }
    place.mutate(base);
  }

  const baseAsset = market?.baseAsset ?? 'USDT';
  const quoteAsset = market?.quoteAsset ?? 'INR';

  return (
    <Card>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide('BUY')}
          className={`rounded-md py-2 text-sm font-medium ${
            side === 'BUY'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide('SELL')}
          className={`rounded-md py-2 text-sm font-medium ${
            side === 'SELL' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Sell
        </button>
      </div>

      <Field label="Order type">
        <Select value={type} onChange={(e) => setType(e.target.value as OrderType)}>
          <option value="LIMIT">Limit</option>
          <option value="MARKET">Market</option>
        </Select>
      </Field>

      <form onSubmit={submit}>
        {type === 'LIMIT' && (
          <>
            <Field label={`Price (${quoteAsset})`}>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>
            <Field label={`Quantity (${baseAsset})`}>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          </>
        )}

        {type === 'MARKET' && side === 'BUY' && (
          <Field label={`Budget (${quoteAsset})`}>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={quoteBudget}
              onChange={(e) => setQuoteBudget(e.target.value)}
            />
          </Field>
        )}

        {type === 'MARKET' && side === 'SELL' && (
          <Field label={`Quantity (${baseAsset})`}>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
        )}

        <Button
          type="submit"
          disabled={place.isPending}
          className={`w-full ${
            side === 'BUY'
              ? 'bg-green-600 hover:bg-green-500'
              : 'bg-red-600 hover:bg-red-500'
          }`}
        >
          {place.isPending
            ? 'Placing…'
            : `${side === 'BUY' ? 'Buy' : 'Sell'} ${baseAsset}`}
        </Button>
      </form>

      {place.isError && (
        <div className="mt-3">
          <Alert>{errorMessage(place.error)}</Alert>
        </div>
      )}
      {place.isSuccess && (
        <div className="mt-3">
          <Alert kind="success">
            Order {place.data?.data.status.toLowerCase()} ({place.data?.data.id.slice(0, 8)})
          </Alert>
        </div>
      )}
      {market && (
        <p className="mt-3 text-xs text-gray-500">
          Min notional {market.minNotional} {quoteAsset} · tick {market.tickSize} ·
          step {market.stepSize}
        </p>
      )}
    </Card>
  );
}

function Balances({ live }: { live: boolean }) {
  const q = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    // Balances are pushed via balance.updated; poll only when disconnected.
    refetchInterval: live ? false : 8000,
  });
  const balances = q.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');

  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold">Balances</h2>
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}
      <div className="space-y-1 text-sm">
        <BalanceRow asset="INR" available={inr?.available} locked={inr?.locked} />
        <BalanceRow asset="USDT" available={usdt?.available} locked={usdt?.locked} />
      </div>
    </Card>
  );
}

function BalanceRow({
  asset,
  available,
  locked,
}: {
  asset: string;
  available?: string;
  locked?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{asset}</span>
      <span className="font-mono">
        {available ?? '0'}{' '}
        <span className="text-xs text-gray-400">(locked {locked ?? '0'})</span>
      </span>
    </div>
  );
}

function OpenOrders({ symbol, live }: { symbol: string; live: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['open-orders', symbol],
    queryFn: () => userApi.openOrders(symbol),
    // order.updated pushes keep this live; poll only as a fallback.
    refetchInterval: live ? false : 5000,
  });
  const cancel = useMutation({
    mutationFn: (orderId: string) => userApi.cancelOrder(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['open-orders'] });
      qc.invalidateQueries({ queryKey: ['orderbook', symbol] });
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
    },
  });
  const orders = q.data?.data.items ?? [];

  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold">Open orders</h2>
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}
      {cancel.isError && (
        <div className="mb-2">
          <Alert>{errorMessage(cancel.error)}</Alert>
        </div>
      )}
      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">No open orders.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1">Market</th>
                <th>Side</th>
                <th>Type</th>
                <th className="text-right">Price</th>
                <th className="text-right">Qty / Filled</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: Order) => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="py-2">{o.marketSymbol}</td>
                  <td className={o.side === 'BUY' ? 'text-green-600' : 'text-red-600'}>
                    {o.side}
                  </td>
                  <td>{o.type}</td>
                  <td className="text-right font-mono">{o.price ?? '—'}</td>
                  <td className="text-right font-mono">
                    {o.quantity ?? o.quoteBudget ?? '—'} / {o.filledQuantity}
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => cancel.mutate(o.id)}
                      disabled={cancel.isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RecentTrades({ symbol, live }: { symbol: string; live: boolean }) {
  const q = useQuery({
    queryKey: ['trades', symbol],
    queryFn: () => userApi.tradeHistory(symbol, 20),
    // trade.executed invalidates this query; poll only as a fallback.
    refetchInterval: live ? false : 4000,
  });
  const trades = q.data?.data.items ?? [];

  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold">Your recent trades</h2>
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}
      {trades.length === 0 ? (
        <p className="text-sm text-gray-500">No trades yet.</p>
      ) : (
        <div className="space-y-0.5">
          <div className="grid grid-cols-3 text-xs font-medium text-gray-500">
            <span>Price</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Side</span>
          </div>
          {trades.map((t) => (
            <div key={t.id} className="grid grid-cols-3 text-xs">
              <span className="font-mono">{t.price}</span>
              <span className="text-right font-mono">{t.quantity}</span>
              <span
                className={`text-right ${
                  t.side === 'BUY' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {t.side}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
