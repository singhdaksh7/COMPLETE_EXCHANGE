'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import type { Market } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[350px] w-[350px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function MarketsPage() {
  const ready = useGuard('user');
  const q = useQuery({
    queryKey: ['markets'],
    queryFn: () => userApi.listMarkets(),
    enabled: ready,
  });

  if (!ready) return null;
  const markets = q.data?.data.items ?? [];

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-20">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #111114 !important; border-bottom: 1px solid rgba(245,194,66,0.15) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <UserNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-4xl px-5 pt-8">
        <div className="mb-6 flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Supported Spot Markets</h1>
            <p className="text-xs text-white/50 mt-1">Audit active pricing indices and order book quotes.</p>
          </div>
        </div>

        {q.isLoading && <p className="text-sm text-white/40">Loading trading pairs...</p>}
        {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}

        {q.data && (
          <div className="relative rounded-2xl border border-gold/15 bg-white/[0.03] shadow-gold-soft backdrop-blur-2xl overflow-hidden p-6">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
            
            <div className="relative z-10">
              <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 border-b border-white/5 pb-3 text-xs font-semibold uppercase tracking-wider text-white/45">
                <span>Trading Pair</span>
                <span>Asset Family</span>
                <span className="text-right">Indicative Rate</span>
                <span className="text-right">Engine State</span>
              </div>
              
              {markets.length === 0 ? (
                <p className="py-6 text-sm text-white/40 text-center">No spot markets registered currently.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {markets.map((m) => <MarketRow key={m.symbol} market={m} />)}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MarketRow({ market }: { market: Market }) {
  const book = useQuery({
    queryKey: ['orderbook-top', market.symbol],
    queryFn: () => userApi.orderBook(market.symbol, 1),
    refetchInterval: 5000,
  });

  const bestBid = book.data?.data.bids[0]?.price;
  const bestAsk = book.data?.data.asks[0]?.price;
  const last = bestBid ?? bestAsk ?? null;

  return (
    <Link
      href={`/trade?symbol=${encodeURIComponent(market.symbol)}`}
      className="grid grid-cols-[1.5fr_1fr_1fr_auto] items-center gap-2 py-4 text-sm hover:bg-white/[0.02] transition px-2 rounded-lg -mx-2"
    >
      <span className="font-semibold text-white">{market.symbol}</span>
      <span className="text-white/60">
        {market.baseAsset} / {market.quoteAsset}
      </span>
      <span className="text-right font-mono font-medium text-gold">
        {last ? `₹${last}` : '—'}
      </span>
      <span className="text-right">
        <StatusBadge status={market.status} />
      </span>
    </Link>
  );
}
