'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useRealtime } from '@/lib/use-realtime';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { MarketChart } from '@/components/market-chart';
import { StatusBadge } from '@/components/ui';
import type {
  Market,
  Order,
  OrderSide,
  OrderType,
  PlaceOrderInput,
} from '@/lib/types';

const DEFAULT_SYMBOL = 'USDT-INR';

// BackdropGlow is handled inside UserShell

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

  const { connected: live } = useRealtime(symbol);

  if (!ready) return null;

  return (
    <UserShell className="max-w-[1400px]">
        
        {/* Header toolbar */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Spot Trading Desk</h1>
            <ConnectionBadge live={live} />
          </div>
          
          <div className="w-full sm:w-56 flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Trading Market</label>
            <select
              value={symbol}
              onChange={(e) =>
                router.push(`/trade?symbol=${encodeURIComponent(e.target.value)}`)
              }
              className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none"
            >
              {markets.length === 0 && <option value={symbol}>{symbol}</option>}
              {markets.map((m) => (
                <option key={m.symbol} value={m.symbol} className="bg-noir">
                  {m.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>

        {marketsQ.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(marketsQ.error)}</div>}

        {/* Live chart overlay */}
        <div className="mb-6 rounded-2xl border border-white/5 bg-white/[0.01] p-4 overflow-hidden">
          <MarketChart symbol={symbol} live={live} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          
          {/* Orderbook card */}
          <div className="lg:col-span-1">
            <OrderBookPanel symbol={symbol} live={live} />
          </div>
          
          {/* Trade panel */}
          <div className="lg:col-span-1 space-y-6">
            <OrderForm symbol={symbol} market={market} />
            <Balances live={live} />
          </div>
          
          {/* Recent Trades list */}
          <div className="lg:col-span-1">
            <RecentTrades symbol={symbol} live={live} />
          </div>
        </div>

        {/* Open Orders */}
        <div className="mt-6">
          <OpenOrders symbol={symbol} live={live} />
        </div>
      </UserShell>
  );
}

function ConnectionBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        live ? 'bg-up/10 text-up' : 'bg-brand/10 text-brand'
      }`}
      title={
        live
          ? 'Live updates over WebSocket'
          : 'Socket disconnected — falling back to polling'
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-up animate-pulse' : 'bg-brand'}`}
      />
      {live ? 'Live' : 'Polling'}
    </span>
  );
}

function OrderBookPanel({ symbol, live }: { symbol: string; live: boolean }) {
  const q = useQuery({
    queryKey: ['orderbook', symbol],
    queryFn: () => userApi.orderBook(symbol, 15),
    refetchInterval: live ? false : 3000,
  });
  const book = q.data?.data;

  return (
    <div className="relative rounded-2xl border border-gold/15 bg-white/[0.03] p-5 shadow-gold-soft backdrop-blur-2xl">
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
      
      <div className="relative z-10 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gold">Order Book · {symbol}</h2>
        {q.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{errorMessage(q.error)}</div>}
        
        <div className="grid grid-cols-2 gap-1 text-[10px] font-bold uppercase tracking-wider text-white/40 border-b border-white/5 pb-2">
          <span>Price (INR)</span>
          <span className="text-right">Qty</span>
        </div>

        <div className="space-y-1">
          {/* Asks (Sell orders) - top of book */}
          {(book?.asks ?? [])
            .slice()
            .reverse()
            .map((lvl, i) => (
              <div key={`a${i}`} className="grid grid-cols-2 text-xs hover:bg-white/[0.02] px-1 py-0.5 rounded transition">
                <span className="font-mono text-down font-medium">{lvl.price}</span>
                <span className="text-right font-mono text-white/80">{lvl.quantity}</span>
              </div>
            ))}
        </div>

        <div className="my-2 border-t border-white/5" />

        <div className="space-y-1">
          {/* Bids (Buy orders) - bottom of book */}
          {(book?.bids ?? []).map((lvl, i) => (
            <div key={`b${i}`} className="grid grid-cols-2 text-xs hover:bg-white/[0.02] px-1 py-0.5 rounded transition">
              <span className="font-mono text-up font-medium">{lvl.price}</span>
              <span className="text-right font-mono text-white/80">{lvl.quantity}</span>
            </div>
          ))}
        </div>

        {book && book.asks.length === 0 && book.bids.length === 0 && (
          <p className="py-4 text-xs text-white/40 text-center">No resting orders inside book.</p>
        )}
      </div>
    </div>
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
    <div className="relative rounded-2xl border border-gold/15 bg-white/[0.03] p-5 shadow-gold-soft backdrop-blur-2xl">
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
      
      <div className="relative z-10 space-y-4">
        
        {/* Buy/Sell Selector */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setSide('BUY')}
            className={`rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              side === 'BUY'
                ? 'bg-up text-white shadow-[0_0_15px_rgba(14,203,129,0.3)]'
                : 'bg-white/5 border border-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide('SELL')}
            className={`rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              side === 'SELL'
                ? 'bg-down text-white shadow-[0_0_15px_rgba(246,70,93,0.3)]'
                : 'bg-white/5 border border-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            Sell
          </button>
        </div>

        {/* Order Type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Order Type</label>
          <select 
            value={type} 
            onChange={(e) => setType(e.target.value as OrderType)}
            className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none"
          >
            <option value="LIMIT" className="bg-noir">Limit Order</option>
            <option value="MARKET" className="bg-noir">Market Order</option>
          </select>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {type === 'LIMIT' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Price ({quoteAsset})</label>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none font-mono"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Quantity ({baseAsset})</label>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none font-mono"
                  required
                />
              </div>
            </>
          )}

          {type === 'MARKET' && side === 'BUY' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Budget ({quoteAsset})</label>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={quoteBudget}
                onChange={(e) => setQuoteBudget(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none font-mono"
                required
              />
            </div>
          )}

          {type === 'MARKET' && side === 'SELL' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Quantity ({baseAsset})</label>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none font-mono"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={place.isPending}
            className={`w-full rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider text-white transition ${
              side === 'BUY'
                ? 'bg-up hover:opacity-90'
                : 'bg-down hover:opacity-90'
            }`}
          >
            {place.isPending
              ? 'Placing...'
              : `${side === 'BUY' ? 'Buy' : 'Sell'} ${baseAsset}`}
          </button>
        </form>

        {place.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
            {errorMessage(place.error)}
          </div>
        )}
        {place.isSuccess && (
          <div className="rounded-lg bg-up/10 border border-up/20 p-3 text-xs text-up">
            Order {place.data?.data.status.toLowerCase()} ({place.data?.data.id.slice(0, 8)})
          </div>
        )}
        {market && (
          <div className="text-[9px] text-white/35 leading-relaxed border-t border-white/5 pt-2 mt-2">
            Min quote: {market.minNotional} {quoteAsset} · tick {market.tickSize} · step {market.stepSize}
          </div>
        )}
      </div>
    </div>
  );
}

function Balances({ live }: { live: boolean }) {
  const q = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    refetchInterval: live ? false : 8000,
  });
  const balances = q.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');

  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Ledger Balances</h2>
      {q.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{errorMessage(q.error)}</div>}
      
      <div className="space-y-2.5 text-xs">
        <BalanceRow asset="INR" available={inr?.available} locked={inr?.locked} />
        <BalanceRow asset="USDT" available={usdt?.available} locked={usdt?.locked} />
      </div>
    </div>
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
    <div className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <span className="text-white/45 font-semibold">{asset}</span>
      <span className="font-mono text-ink">
        {available ?? '0'}{' '}
        <span className="text-[10px] text-white/30">(locked {locked ?? '0'})</span>
      </span>
    </div>
  );
}

function OpenOrders({ symbol, live }: { symbol: string; live: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['open-orders', symbol],
    queryFn: () => userApi.openOrders(symbol),
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
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
      <h2 className="text-sm font-bold text-white tracking-tight border-b border-white/5 pb-2">Active Open Orders</h2>
      {q.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{errorMessage(q.error)}</div>}
      {cancel.isError && (
        <div className="mb-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
          {errorMessage(cancel.error)}
        </div>
      )}
      
      {orders.length === 0 ? (
        <p className="text-xs text-white/40 py-6 text-center">No active resting orders.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 text-white/45 uppercase tracking-wider font-semibold text-[10px]">
                <th className="py-2.5">Market</th>
                <th>Side</th>
                <th>Type</th>
                <th className="text-right">Price</th>
                <th className="text-right">Qty / Filled</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((o: Order) => (
                <tr key={o.id} className="hover:bg-white/[0.01]">
                  <td className="py-3 font-semibold text-white">{o.marketSymbol}</td>
                  <td className={`font-semibold ${o.side === 'BUY' ? 'text-up' : 'text-down'}`}>
                    {o.side}
                  </td>
                  <td>{o.type}</td>
                  <td className="text-right font-mono font-medium text-gold">{o.price ?? '—'}</td>
                  <td className="text-right font-mono text-white/80">
                    {o.quantity ?? o.quoteBudget ?? '—'} / {o.filledQuantity}
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => cancel.mutate(o.id)}
                      disabled={cancel.isPending}
                      className="text-xs text-down font-bold hover:underline disabled:opacity-50"
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
    </div>
  );
}

function RecentTrades({ symbol, live }: { symbol: string; live: boolean }) {
  const q = useQuery({
    queryKey: ['trades', symbol],
    queryFn: () => userApi.tradeHistory(symbol, 20),
    refetchInterval: live ? false : 4000,
  });
  const trades = q.data?.data.items ?? [];

  return (
    <div className="relative rounded-2xl border border-gold/15 bg-white/[0.03] p-5 shadow-gold-soft backdrop-blur-2xl">
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
      
      <div className="relative z-10 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gold">My Recent Trades</h2>
        {q.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{errorMessage(q.error)}</div>}
        
        {trades.length === 0 ? (
          <p className="text-xs text-white/40 py-6 text-center">No trades logged yet.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 text-[10px] font-bold uppercase tracking-wider text-white/40 border-b border-white/5 pb-2">
              <span>Price</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Side</span>
            </div>
            
            {trades.map((t) => (
              <div key={t.id} className="grid grid-cols-3 text-xs hover:bg-white/[0.02] px-1 py-0.5 rounded transition">
                <span className="font-mono font-medium text-white">{t.price}</span>
                <span className="text-right font-mono text-white/70">{t.quantity}</span>
                <span
                  className={`text-right font-bold text-[10px] ${
                    t.side === 'BUY' ? 'text-up' : 'text-down'
                  }`}
                >
                  {t.side}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
