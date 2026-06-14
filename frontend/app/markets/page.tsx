'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Alert, StatusBadge } from '@/components/ui';
import type { Market } from '@/lib/types';

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
    <>
      <UserNav />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Markets</h1>

        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {q.data && (
          <Card>
            <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 border-b border-gray-200 pb-2 text-xs font-medium text-gray-500">
              <span>Market</span>
              <span>Pair</span>
              <span className="text-right">Last price</span>
              <span className="text-right">Status</span>
            </div>
            {markets.length === 0 ? (
              <p className="py-4 text-sm text-gray-500">No markets available.</p>
            ) : (
              markets.map((m) => <MarketRow key={m.symbol} market={m} />)
            )}
          </Card>
        )}
      </main>
    </>
  );
}

/**
 * One market row. There is no public "last price" endpoint, so we derive an
 * indicative price from the top of the order book (best bid, else best ask).
 */
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
      className="grid grid-cols-[1.5fr_1fr_1fr_auto] items-center gap-2 border-b border-gray-100 py-3 text-sm last:border-0 hover:bg-gray-50"
    >
      <span className="font-medium">{market.symbol}</span>
      <span className="text-gray-600">
        {market.baseAsset}/{market.quoteAsset}
      </span>
      <span className="text-right font-mono">
        {last ? `₹${last}` : '—'}
      </span>
      <span className="text-right">
        <StatusBadge status={market.status} />
      </span>
    </Link>
  );
}
