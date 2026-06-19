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

  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    enabled: ready,
  });
  const me = meQ.data?.data;
  const kycStatus = me?.user.kycStatus ?? 'PENDING';

  // KYC Warning Banner
  const kycBanner = useMemo(() => {
    if (kycStatus === 'APPROVED') return null;

    let title = 'Identity Verification Required';
    let description = 'Your account is in view-only mode. Verify your identity to unlock live trading deposits, orders, and withdrawals.';
    let ctaLabel = 'Start KYC';
    let ctaPath = '/kyc/submit';

    if (kycStatus === 'PENDING' || kycStatus === 'IN_REVIEW' || kycStatus === 'MANUAL_REVIEW') {
      title = 'KYC Verification Pending';
      description = 'Your identity documents are under compliance review. Trading will unlock automatically once approved.';
      ctaLabel = 'Check Status';
      ctaPath = '/kyc/status';
    } else if (kycStatus === 'REJECTED') {
      title = 'KYC Verification Rejected';
      description = 'Your identity documents were rejected by compliance. Please review and resubmit to unlock trading.';
      ctaLabel = 'Resubmit KYC';
      ctaPath = '/kyc/submit';
    }

    return (
      <div className="relative mb-6 rounded-2xl border border-gold/20 bg-gradient-to-r from-gold/10 via-noir to-noir p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 overflow-hidden">
        <div className="absolute -left-16 -top-16 h-36 w-36 rounded-full bg-gold/5 blur-[50px] pointer-events-none" />
        <div className="relative z-10 flex gap-3.5 items-start">
          <span className="text-xl text-gold shrink-0">⚠️</span>
          <div>
            <h3 className="text-sm font-bold text-gold tracking-tight">{title}</h3>
            <p className="text-xs text-white/60 mt-0.5 max-w-[800px] leading-relaxed">{description}</p>
          </div>
        </div>
        <button
          onClick={() => router.push(ctaPath)}
          className="relative z-10 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-2.5 text-xs font-black text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider shrink-0"
        >
          {ctaLabel}
        </button>
      </div>
    );
  }, [kycStatus, router]);

  const { connected: live } = useRealtime(symbol);

  if (!ready) return null;

  return (
    <UserShell className="max-w-[1440px]">
      {/* Header toolbar */}
      <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">
            Spot Trading Desk
          </h1>
          <span
            title="Sandbox / test market — no real liquidity or volume. Book and trades reflect orders placed on this environment only."
            className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300"
          >
            Sandbox
          </span>
          <ConnectionBadge live={live} />
        </div>

        <div className="w-full sm:w-56 flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Trading Market</label>
          <select
            value={symbol}
            onChange={(e) => router.push(`/trade?symbol=${encodeURIComponent(e.target.value)}`)}
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

      {kycBanner}

      {marketsQ.isError && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
          {errorMessage(marketsQ.error)}
        </div>
      )}

      {/* Live chart overlay */}
      <div className="mb-6 rounded-2xl border border-white/5 bg-white/[0.01] p-4 overflow-hidden">
        <MarketChart symbol={symbol} live={live} />
      </div>

      {/* Layout Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left/Middle Column (8 cols): Orderbook & Market Depth */}
        <div className="lg:col-span-8 space-y-6">
          <OrderBookPanel symbol={symbol} live={live} market={market} />
        </div>

        {/* Right Column (4 cols): Order Form, Balances, Recent Trades */}
        <div className="lg:col-span-4 space-y-6">
          <OrderForm symbol={symbol} market={market} kycStatus={kycStatus} />
          <Balances live={live} />
          <RecentTrades symbol={symbol} live={live} />
        </div>
      </div>

      {/* Open Orders (Full width bottom) */}
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
      title={live ? 'Live updates over WebSocket' : 'Socket disconnected — falling back to polling'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-up animate-pulse' : 'bg-brand'}`} />
      {live ? 'Live' : 'Polling'}
    </span>
  );
}

/* Redesigned Orderbook + Depth Panel */
function OrderBookPanel({ symbol, live, market }: { symbol: string; live: boolean; market?: Market }) {
  const q = useQuery({
    queryKey: ['orderbook', symbol],
    queryFn: () => userApi.orderBook(symbol, 15),
    refetchInterval: live ? false : 3000,
  });

  const usdtInrTickerQ = useQuery({
    queryKey: ['ticker', 'USDT-INR'],
    queryFn: () => userApi.ticker('USDT-INR'),
  });
  const usdtInrPrice = Number(usdtInrTickerQ.data?.data.lastPrice ?? 85.00);

  const tickerQ = useQuery({
    queryKey: ['ticker', symbol],
    queryFn: () => userApi.ticker(symbol),
    refetchInterval: 5000,
  });
  const ticker = tickerQ.data?.data;
  const lastPrice = ticker?.lastPrice ? Number(ticker.lastPrice) : null;

  const baseAsset = market?.baseAsset ?? 'USDT';
  const quoteAsset = market?.quoteAsset ?? 'INR';

  const book = q.data?.data;

  // Process bids and asks with cumulative totals
  const bids = useMemo(() => {
    let sum = 0;
    return (book?.bids ?? []).map((b) => {
      const price = Number(b.price);
      const qty = Number(b.quantity);
      const total = price * qty;
      sum += total;
      return { price, qty, total, cumulative: sum };
    });
  }, [book?.bids]);

  const asks = useMemo(() => {
    let sum = 0;
    return (book?.asks ?? []).map((a) => {
      const price = Number(a.price);
      const qty = Number(a.quantity);
      const total = price * qty;
      sum += total;
      return { price, qty, total, cumulative: sum };
    });
  }, [book?.asks]);

  // Compute Spread details
  const spreadDetails = useMemo(() => {
    if (bids.length === 0 || asks.length === 0) {
      const fallbackMid = lastPrice ?? 0;
      const fallbackInr = quoteAsset === 'INR' ? fallbackMid : fallbackMid * usdtInrPrice;
      return { spread: 0, pct: 0, mid: fallbackMid, inr: fallbackInr };
    }
    const highestBid = bids[0].price;
    const lowestAsk = asks[0].price;
    const spread = Math.max(0, lowestAsk - highestBid);
    const mid = (highestBid + lowestAsk) / 2;
    const pct = mid > 0 ? (spread / mid) * 100 : 0;
    const inr = quoteAsset === 'INR' ? mid : mid * usdtInrPrice; // estimate INR conversion if base is USDT
    return { spread, pct, mid, inr };
  }, [bids, asks, quoteAsset, usdtInrPrice, lastPrice]);

  // Max cumulative volume for depth percentage bars scaling
  const maxBidsCumulative = bids.length > 0 ? bids[bids.length - 1].cumulative : 1;
  const maxAsksCumulative = asks.length > 0 ? asks[asks.length - 1].cumulative : 1;
  const maxCumulativeVal = Math.max(maxBidsCumulative, maxAsksCumulative);

  // Dynamic depth curves for chart
  const bidsPoints = bids.map((b, i) => {
    const x = 250 - (i / Math.max(1, bids.length - 1)) * 250;
    const y = 120 - (b.cumulative / (maxCumulativeVal || 1)) * 110;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const bidsPath = bidsPoints.length > 0
    ? `M 250,120 L 250,${(120 - (bids[0].cumulative / (maxCumulativeVal || 1)) * 110).toFixed(1)} L ${bidsPoints.join(' L ')} L 0,120 Z`
    : 'M 0,120 L 250,120 Z';

  const asksPoints = asks.map((a, i) => {
    const x = 250 + (i / Math.max(1, asks.length - 1)) * 250;
    const y = 120 - (a.cumulative / (maxCumulativeVal || 1)) * 110;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const asksPath = asksPoints.length > 0
    ? `M 250,120 L 250,${(120 - (asks[0].cumulative / (maxCumulativeVal || 1)) * 110).toFixed(1)} L ${asksPoints.join(' L ')} L 500,120 Z`
    : 'M 250,120 L 500,120 Z';

  const leftLabel = bids.length > 0 ? bids[bids.length - 1].price.toFixed(2) : lastPrice ? (lastPrice * 0.95).toFixed(2) : '—';
  const rightLabel = asks.length > 0 ? asks[asks.length - 1].price.toFixed(2) : lastPrice ? (lastPrice * 1.05).toFixed(2) : '—';

  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-6">
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

      {/* Title Header */}
      <div className="relative z-10 flex justify-between items-center border-b border-white/5 pb-3">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight uppercase">Order Book</h2>
          <p className="text-[10px] text-white/40 mt-0.5">Sandbox market — bids/asks reflect orders placed on this environment.</p>
        </div>
        <div className="flex items-center gap-3">
          <select disabled title="Grouping selector coming soon" className="rounded border border-white/10 bg-noir px-2 py-1 text-[10px] text-white/40 focus:outline-none cursor-not-allowed opacity-50">
            <option>Grouping 0.01 (Coming soon)</option>
          </select>
        </div>
      </div>

      {q.isError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
          {errorMessage(q.error)}
        </div>
      )}

      {/* Horizonal Columns Grid (Bids, Spread Details, Asks) */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-7 gap-4 items-stretch">
        {/* Left Side (3 cols): BIDS */}
        <div className="md:col-span-3 space-y-2.5">
          <span className="text-[10px] font-bold text-up uppercase tracking-wider block">Bids</span>
          
          <div className="grid grid-cols-3 text-[9px] font-bold uppercase tracking-wider text-white/30 border-b border-white/5 pb-1.5 font-mono">
            <span>Price ({quoteAsset})</span>
            <span className="text-right">Amount ({baseAsset})</span>
            <span className="text-right">Total ({quoteAsset})</span>
          </div>

          <div className="space-y-1 min-h-[300px]">
            {bids.map((b, i) => {
              const widthPct = Math.min(100, (b.cumulative / maxCumulativeVal) * 100);
              return (
                <div
                  key={`bid-${i}`}
                  className="grid grid-cols-3 text-xs py-1 hover:bg-white/[0.02] rounded px-1 transition relative overflow-hidden font-mono"
                >
                  {/* Depth overlay bar */}
                  <div
                    className="absolute inset-y-0 right-0 bg-up/5 pointer-events-none transition-all duration-300"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="text-up font-bold relative z-10">{b.price.toFixed(2)}</span>
                  <span className="text-right text-white/70 relative z-10">{b.qty.toFixed(4)}</span>
                  <span className="text-right text-white/40 relative z-10">{b.total.toFixed(2)}</span>
                </div>
              );
            })}
            {bids.length === 0 && (
              <p className="text-xs text-white/30 text-center py-12">
                No buy orders yet on this sandbox market.
                <br />Depth appears once limit orders are placed.
              </p>
            )}
          </div>
        </div>

        {/* Center Detail (1 col): SPREAD details */}
        <div className="md:col-span-1 flex flex-col justify-center items-center text-center py-4 md:py-0 border-y md:border-y-0 md:border-x border-white/5 px-2">
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Spread</span>
          <span className="text-xs font-bold text-white font-mono mt-0.5">{spreadDetails.spread.toFixed(2)} {quoteAsset}</span>
          <span className="text-[9px] text-white/40 font-mono">{spreadDetails.pct.toFixed(5)}%</span>

          <div className="my-4 w-full border-t border-white/5 border-dashed" />

          {/* Up arrow / Mid Price */}
          <div className="flex flex-col items-center">
            <span className="text-up text-lg font-bold">▲</span>
            <span className="text-sm font-black text-white font-mono leading-tight">{spreadDetails.mid.toFixed(2)}</span>
            <span className="text-[9px] text-white/45 font-mono mt-0.5">≈ ₹{spreadDetails.inr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Right Side (3 cols): ASKS */}
        <div className="md:col-span-3 space-y-2.5">
          <span className="text-[10px] font-bold text-down uppercase tracking-wider block">Asks</span>
          
          <div className="grid grid-cols-3 text-[9px] font-bold uppercase tracking-wider text-white/30 border-b border-white/5 pb-1.5 font-mono">
            <span>Price ({quoteAsset})</span>
            <span className="text-right">Amount ({baseAsset})</span>
            <span className="text-right">Total ({quoteAsset})</span>
          </div>

          <div className="space-y-1 min-h-[300px]">
            {asks.map((a, i) => {
              const widthPct = Math.min(100, (a.cumulative / maxCumulativeVal) * 100);
              return (
                <div
                  key={`ask-${i}`}
                  className="grid grid-cols-3 text-xs py-1 hover:bg-white/[0.02] rounded px-1 transition relative overflow-hidden font-mono"
                >
                  {/* Depth overlay bar */}
                  <div
                    className="absolute inset-y-0 right-0 bg-down/5 pointer-events-none transition-all duration-300"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="text-down font-bold relative z-10">{a.price.toFixed(2)}</span>
                  <span className="text-right text-white/70 relative z-10">{a.qty.toFixed(4)}</span>
                  <span className="text-right text-white/40 relative z-10">{a.total.toFixed(2)}</span>
                </div>
              );
            })}
            {asks.length === 0 && (
              <p className="text-xs text-white/30 text-center py-12">
                No sell orders yet on this sandbox market.
                <br />Depth appears once limit orders are placed.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Market Depth Section */}
      <div className="relative z-10 border-t border-white/5 pt-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Market Depth</h3>
          <span className="text-[9px] text-white/40 font-mono">5 Decimals</span>
        </div>

        {/* Dynamic SVG Area Depth Chart */}
        <div className="relative h-44 w-full bg-noir-2/30 rounded-xl border border-white/5 p-2 overflow-hidden flex items-end">
          <svg className="w-full h-full text-white" viewBox="0 0 500 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="bidDepthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ecb81" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#0ecb81" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="askDepthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f6465d" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#f6465d" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Bids Depth Curve (Left side) */}
            <path
              d={bidsPath}
              fill="url(#bidDepthGrad)"
              stroke="#0ecb81"
              strokeWidth="1.5"
            />

            {/* Asks Depth Curve (Right side) */}
            <path
              d={asksPath}
              fill="url(#askDepthGrad)"
              stroke="#f6465d"
              strokeWidth="1.5"
            />

            {/* Mid point dotted line */}
            <line x1="250" y1="10" x2="250" y2="120" stroke="#F5C242" strokeDasharray="3 3" strokeWidth="1" />
          </svg>

          {/* Depth Mid tooltip */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-noir/90 border border-white/10 rounded px-2.5 py-1.5 text-[10px] space-y-0.5 text-center shadow-gold-soft pointer-events-none">
            <div className="text-white/40">Mid Price ({quoteAsset})</div>
            <div className="font-bold text-white font-mono">{spreadDetails.mid.toFixed(2)}</div>
            <div className="text-up font-mono font-bold">Total Depth: {maxCumulativeVal.toFixed(2)}</div>
          </div>

          {/* Axes labels overlay */}
          <div className="absolute bottom-1 left-2 text-[8px] text-white/30 font-mono">
            {quoteAsset === 'INR' ? '₹' : ''}{leftLabel}
          </div>
          <div className="absolute bottom-1 right-2 text-[8px] text-white/30 font-mono">
            {quoteAsset === 'INR' ? '₹' : ''}{rightLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderForm({ symbol, market, kycStatus }: { symbol: string; market?: Market; kycStatus: string }) {
  const qc = useQueryClient();
  const router = useRouter();
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
    if (kycStatus !== 'APPROVED') return;
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
  const makerBps = market?.makerFeeBps ?? 0;
  const takerBps = market?.takerFeeBps ?? 0;

  // Conservative (taker-rate) fee estimate for the order being entered. The fee
  // is charged on the asset the user RECEIVES: BUY → base, SELL → quote. Only
  // shown for LIMIT orders where the amount is known up front; MARKET fills
  // depend on the execution price, so we show the rate but not a figure.
  const feeEstimate = useMemo(() => {
    if (type !== 'LIMIT') return null;
    const p = Number(price);
    const qty = Number(quantity);
    if (!Number.isFinite(p) || !Number.isFinite(qty) || p <= 0 || qty <= 0) return null;
    if (side === 'BUY') {
      return { amount: (qty * takerBps) / 10000, asset: baseAsset };
    }
    return { amount: (p * qty * takerBps) / 10000, asset: quoteAsset };
  }, [type, side, price, quantity, takerBps, baseAsset, quoteAsset]);

  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

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
            disabled={place.isPending || kycStatus !== 'APPROVED'}
            className={`w-full rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider text-white transition ${
              kycStatus !== 'APPROVED'
                ? 'bg-white/5 border border-white/5 text-white/30 cursor-not-allowed'
                : side === 'BUY'
                  ? 'bg-up hover:opacity-90 shadow-[0_0_15px_rgba(14,203,129,0.3)]'
                  : 'bg-down hover:opacity-90 shadow-[0_0_15px_rgba(246,70,93,0.3)]'
            }`}
          >
            {place.isPending ? 'Placing...' : kycStatus !== 'APPROVED' ? 'Verification Required' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${baseAsset}`}
          </button>
        </form>

        {place.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300 flex flex-col gap-2">
            <span>{errorMessage(place.error)}</span>
            {errorMessage(place.error).toUpperCase().includes('KYC') && (
              <button
                type="button"
                onClick={() => router.push(kycStatus === 'PENDING' || kycStatus === 'IN_REVIEW' ? '/kyc/status' : '/kyc/submit')}
                className="mt-1 self-start rounded border border-gold/30 bg-gold/5 px-2.5 py-1 text-[10px] font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider"
              >
                Identity Verification Status ➔
              </button>
            )}
          </div>
        )}
        {place.isSuccess && (
          <div className="rounded-lg bg-up/10 border border-up/20 p-3 text-xs text-up font-medium">
            Order {place.data?.data.status.toLowerCase()} ({place.data?.data.id.slice(0, 8)})
          </div>
        )}
        {market && (
          <div className="rounded-lg border border-white/5 bg-noir-2/60 p-3 space-y-1.5 text-[10px]">
            <div className="flex justify-between">
              <span className="text-white/45">Maker fee</span>
              <span className="font-mono text-white/70">{(makerBps / 100).toFixed(2)}% ({makerBps} bps)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/45">Taker fee</span>
              <span className="font-mono text-white/70">{(takerBps / 100).toFixed(2)}% ({takerBps} bps)</span>
            </div>
            {feeEstimate && (
              <div className="flex justify-between border-t border-white/5 pt-1.5">
                <span className="text-white/45">Est. fee (taker)</span>
                <span className="font-mono font-bold text-gold">
                  ~{feeEstimate.amount.toFixed(feeEstimate.asset === quoteAsset ? 2 : 6)} {feeEstimate.asset}
                </span>
              </div>
            )}
          </div>
        )}

        {market && (
          <div className="text-[9px] text-white/35 leading-relaxed border-t border-white/5 pt-2 mt-2 font-mono">
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
      {q.isError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
          {errorMessage(q.error)}
        </div>
      )}

      <div className="space-y-2.5 text-xs">
        <BalanceRow asset="INR" available={inr?.available} locked={inr?.locked} />
        <BalanceRow asset="USDT" available={usdt?.available} locked={usdt?.locked} />
      </div>
    </div>
  );
}

function BalanceRow({ asset, available, locked }: { asset: string; available?: string; locked?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <span className="text-white/45 font-semibold">{asset}</span>
      <span className="font-mono text-white">
        {Number(available ?? 0).toFixed(2)}{' '}
        <span className="text-[10px] text-white/30">(locked {Number(locked ?? 0).toFixed(2)})</span>
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
      {q.isError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
          {errorMessage(q.error)}
        </div>
      )}
      {cancel.isError && (
        <div className="mb-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
          {errorMessage(cancel.error)}
        </div>
      )}

      {orders.length === 0 ? (
        <p className="text-xs text-white/40 py-6 text-center">
          No open orders. Orders you place on this sandbox market appear here until filled or cancelled.
        </p>
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
                  <td className={`font-semibold ${o.side === 'BUY' ? 'text-up' : 'text-down'}`}>{o.side}</td>
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
  const [activeTab, setActiveTab] = useState<'MARKET' | 'USER'>('MARKET');

  const marketTradesQ = useQuery({
    queryKey: ['market-trades', symbol],
    queryFn: () => userApi.marketTrades(symbol, 20),
    refetchInterval: live ? false : 3000,
  });
  const marketTrades = marketTradesQ.data?.data.items ?? [];

  const userTradesQ = useQuery({
    queryKey: ['user-trades', symbol],
    queryFn: () => userApi.tradeHistory(symbol, 20),
    refetchInterval: live ? false : 5000,
  });
  const userTrades = userTradesQ.data?.data.items ?? [];

  const isError = activeTab === 'MARKET' ? marketTradesQ.isError : userTradesQ.isError;
  const error = activeTab === 'MARKET' ? marketTradesQ.error : userTradesQ.error;
  const isLoading = activeTab === 'MARKET' ? marketTradesQ.isLoading : userTradesQ.isLoading;

  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
      <div className="relative z-10 flex gap-4 border-b border-white/5 pb-2">
        <button
          onClick={() => setActiveTab('MARKET')}
          className={`text-xs font-bold uppercase tracking-wider pb-1.5 transition-all border-b-2 ${
            activeTab === 'MARKET' ? 'border-gold text-gold' : 'border-transparent text-white/40 hover:text-white'
          }`}
        >
          Market Trades
        </button>
        <button
          onClick={() => setActiveTab('USER')}
          className={`text-xs font-bold uppercase tracking-wider pb-1.5 transition-all border-b-2 ${
            activeTab === 'USER' ? 'border-gold text-gold' : 'border-transparent text-white/40 hover:text-white'
          }`}
        >
          My Trades
        </button>
      </div>

      <div className="relative z-10 space-y-3">
        {isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
            {errorMessage(error)}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between gap-4 animate-pulse">
                <div className="h-3 bg-white/5 rounded w-1/3" />
                <div className="h-3 bg-white/5 rounded w-1/4" />
                <div className="h-3 bg-white/5 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : activeTab === 'MARKET' ? (
          marketTrades.length === 0 ? (
            <p className="text-xs text-white/40 py-6 text-center font-sans">
              No trades yet on this sandbox market. Trades appear here once orders match.
            </p>
          ) : (
            <div className="space-y-1.5 font-mono text-xs">
              <div className="grid grid-cols-3 text-[10px] font-bold uppercase tracking-wider text-white/30 border-b border-white/5 pb-2">
                <span>Price</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Time</span>
              </div>

              {marketTrades.map((t) => {
                const isBuy = t.side === 'BUY';
                const date = new Date(t.executedAt);
                const timeStr = isNaN(date.getTime())
                  ? '—'
                  : date.toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    });

                return (
                  <div key={t.id} className="grid grid-cols-3 hover:bg-white/[0.02] px-1 py-0.5 rounded transition">
                    <span className={`font-semibold ${isBuy ? 'text-up' : 'text-down'}`}>{t.price}</span>
                    <span className="text-right text-white/70">{t.quantity}</span>
                    <span className="text-right text-white/40">{timeStr}</span>
                  </div>
                );
              })}
            </div>
          )
        ) : userTrades.length === 0 ? (
          <p className="text-xs text-white/40 py-6 text-center font-sans">
            You have no trades on this sandbox market yet. Place an order to get started.
          </p>
        ) : (
          <div className="space-y-1.5 font-mono text-xs">
            <div className="grid grid-cols-4 text-[10px] font-bold uppercase tracking-wider text-white/30 border-b border-white/5 pb-2">
              <span>Price</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Fee</span>
              <span className="text-right">Side</span>
            </div>

            {userTrades.map((t) => {
              const isBuy = t.side === 'BUY';
              return (
                <div key={t.id} className="grid grid-cols-4 hover:bg-white/[0.02] px-1 py-0.5 rounded transition">
                  <span className="font-semibold text-white">{t.price}</span>
                  <span className="text-right text-white/70">{t.quantity}</span>
                  <span className="text-right text-white/50" title={t.role ? `${t.role} fee` : 'fee'}>
                    {t.fee && Number(t.fee) > 0 ? `${t.fee} ${t.feeAsset ?? ''}`.trim() : '—'}
                  </span>
                  <span className={`text-right font-bold text-[10px] ${isBuy ? 'text-up' : 'text-down'}`}>
                    {t.side}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
