'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';
import type { Order, Trade } from '@/lib/types';

export default function OrdersPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  // Filters
  const [sideFilter, setSideFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchPair, setSearchPair] = useState('');
  const [compactView, setCompactView] = useState(false);

  const openQ = useQuery({
    queryKey: ['open-orders'],
    queryFn: () => userApi.openOrders(),
    enabled: ready,
    refetchInterval: 5000,
  });

  const historyQ = useQuery({
    queryKey: ['order-history'],
    queryFn: () => userApi.orderHistory({ limit: 50 }),
    enabled: ready,
  });

  const tradesQ = useQuery({
    queryKey: ['trade-history'],
    queryFn: () => userApi.tradeHistory(undefined, 50),
    enabled: ready,
  });

  const cancel = useMutation({
    mutationFn: (orderId: string) => userApi.cancelOrder(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['open-orders'] });
      qc.invalidateQueries({ queryKey: ['order-history'] });
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
    },
  });

  const tickerQ = useQuery({
    queryKey: ['ticker', 'USDT-INR'],
    queryFn: () => userApi.ticker('USDT-INR'),
  });
  const usdtInrPrice = Number(tickerQ.data?.data.lastPrice ?? 85.00);

  const openOrders = openQ.data?.data.items ?? [];
  const history = historyQ.data?.data.items ?? [];
  const trades = tradesQ.data?.data.items ?? [];

  // Filter open orders dynamically
  const filteredOpenOrders = useMemo(() => {
    return openOrders.filter((o) => {
      const pair = o.marketSymbol.toUpperCase();
      const side = o.side.toUpperCase();
      const type = o.type.toUpperCase();
      const query = searchPair.toUpperCase();

      const pairMatch = pair.includes(query);
      const sideMatch = sideFilter === 'ALL' || side === sideFilter;
      const typeMatch = typeFilter === 'ALL' || type === typeFilter;

      return pairMatch && sideMatch && typeMatch;
    });
  }, [openOrders, searchPair, sideFilter, typeFilter]);

  // Calculate dynamic bottom totals for open orders
  const totals = useMemo(() => {
    let openValue = 0;
    let unfilledValue = 0;
    
    filteredOpenOrders.forEach((o) => {
      const price = Number(o.price ?? 0);
      const qty = Number(o.quantity ?? 0);
      const filled = Number(o.filledQuantity ?? 0);
      
      openValue += price * qty;
      unfilledValue += price * (qty - filled);
    });

    return {
      openValue,
      unfilledValue,
      fees: openValue * 0.001,
    };
  }, [filteredOpenOrders]);

  if (!ready) return null;

  return (
    <UserShell className="max-w-[1400px] space-y-6">
      
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Open Orders</h1>
          <p className="text-xs text-white/50 mt-1">View and manage your active orders</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-white/45 uppercase tracking-wider">
            <span>Compact View</span>
            <button
              onClick={() => setCompactView(!compactView)}
              className={`h-5 w-9 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                compactView ? 'bg-gold justify-end' : 'bg-white/10 justify-start'
              }`}
            >
              <div className="h-4 w-4 rounded-full bg-noir" />
            </button>
          </div>

          <button disabled title="Cancel All coming soon" className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-bold text-white/30 cursor-not-allowed uppercase tracking-wider opacity-50">
            Cancel All (Coming Soon)
          </button>
        </div>
      </div>

      {cancel.isError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
          {errorMessage(cancel.error)}
        </div>
      )}

      {/* Main Open Orders Card */}
      <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
        
        {/* Filters bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white/[0.01] border border-white/5 rounded-xl p-3 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Select Side</span>
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-2 py-1.5 text-white/70 focus:outline-none"
            >
              <option value="ALL">All Sides</option>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Select Type</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-2 py-1.5 text-white/70 focus:outline-none"
            >
              <option value="ALL">All Order Types</option>
              <option value="LIMIT">Limit Order</option>
              <option value="MARKET">Market Order</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 opacity-50">
            <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider">Status</span>
            <select disabled className="rounded-lg border border-white/10 bg-noir px-2 py-1.5 text-white/40 focus:outline-none cursor-not-allowed">
              <option>Status: All (Coming soon)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 justify-center opacity-50">
            <label className="flex items-center gap-2 cursor-not-allowed text-white/30 transition">
              <input disabled type="checkbox" className="rounded bg-noir border-white/10 text-white/20 accent-white/20 cursor-not-allowed" />
              Hide Other Pairs
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Search</span>
            <input
              placeholder="Search by Pair..."
              value={searchPair}
              onChange={(e) => setSearchPair(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-2.5 py-1.5 text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20"
            />
          </div>
        </div>

        {/* Table list */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                <th className="py-3 px-3">Time</th>
                <th className="px-3">Pair</th>
                <th className="px-3">Side</th>
                <th className="px-3">Type</th>
                <th className="px-3 text-right">Price</th>
                <th className="px-3 text-right">Amount</th>
                <th className="px-3 text-right">Filled</th>
                <th className="px-3 text-right">Total</th>
                <th className="px-3 text-right">Trigger Price</th>
                <th className="px-3">Status</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {filteredOpenOrders.map((o) => {
                const qty = Number(o.quantity ?? 0);
                const filled = Number(o.filledQuantity ?? 0);
                const pct = qty > 0 ? (filled / qty) * 100 : 0;
                
                const quoteAsset = o.marketSymbol.split('-')[1] ?? 'USDT';
                const baseAsset = o.marketSymbol.split('-')[0] ?? 'BTC';

                return (
                  <tr key={o.id} className="hover:bg-white/[0.01] transition-all">
                    <td className="py-3.5 px-3 text-white/50 text-[10px]">
                      {new Date(o.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-3 font-sans font-bold text-white flex items-center gap-1.5">
                      <span className="h-5 w-5 rounded-full bg-gold/15 flex items-center justify-center text-[8px] text-gold font-black">
                        {baseAsset.slice(0, 2)}
                      </span>
                      {o.marketSymbol}
                    </td>
                    <td className={`px-3 font-sans font-bold ${o.side === 'BUY' ? 'text-up' : 'text-down'}`}>
                      {o.side}
                    </td>
                    <td className="px-3 text-white/70 font-sans">{o.type}</td>
                    <td className="px-3 text-right text-white">{o.price}</td>
                    <td className="px-3 text-right text-white/80">{qty.toFixed(6)} {baseAsset}</td>
                    <td className="px-3 text-right text-white/60">
                      {filled.toFixed(6)} {baseAsset} ({pct.toFixed(2)}%)
                    </td>
                    <td className="px-3 text-right text-gold font-bold">
                      {(qty * Number(o.price ?? 0)).toFixed(2)} {quoteAsset}
                    </td>
                    <td className="px-3 text-right text-white/40">—</td>
                    <td className="px-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="py-3.5 px-3 text-right font-sans flex items-center justify-end gap-2.5">
                      <button
                        onClick={() => cancel.mutate(o.id)}
                        disabled={cancel.isPending}
                        className="text-down font-bold hover:underline disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredOpenOrders.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-white/30 font-sans">
                    No active open orders found in queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Totals Summary bar */}
        <div className="border-t border-white/5 pt-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs font-sans">
          <div className="flex flex-wrap gap-6 text-[11px]">
            <div>
              <span className="text-white/40 block">Open Orders Value</span>
              <span className="font-mono font-bold text-white block mt-0.5">
                {totals.openValue > 0 ? (
                  `${totals.openValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT (≈ ₹${(totals.openValue * usdtInrPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })})`
                ) : (
                  '0.00 USDT (≈ ₹0.00)'
                )}
              </span>
            </div>
            <div>
              <span className="text-white/40 block">Total Unfilled</span>
              <span className="font-mono font-bold text-white block mt-0.5">
                {totals.unfilledValue > 0 ? (
                  `${totals.unfilledValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT (≈ ₹${(totals.unfilledValue * usdtInrPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })})`
                ) : (
                  '0.00 USDT (≈ ₹0.00)'
                )}
              </span>
            </div>
            <div>
              <span className="text-white/40 block">Estimated Fees</span>
              <span className="font-mono font-bold text-gold block mt-0.5">
                {totals.fees > 0 ? `${totals.fees.toFixed(2)} USDT` : '0.00 USDT'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] text-white/45">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse" />
              Real-time updates
            </span>
            <button disabled title="Auto Cancel coming soon" className="rounded border border-white/5 bg-white/[0.01] px-3 py-1.5 text-white/30 cursor-not-allowed font-bold uppercase opacity-50">
              Auto Cancel
            </button>
          </div>
        </div>

      </div>

      {/* History log block */}
      <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
        <h2 className="text-sm font-bold text-white tracking-tight border-b border-white/5 pb-2">Order Execution History</h2>
        
        {historyQ.isLoading && <p className="text-xs text-white/30 py-4">Loading executions...</p>}
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                <th className="py-2.5 px-3">Date</th>
                <th className="px-3">Pair</th>
                <th className="px-3">Side</th>
                <th className="px-3">Type</th>
                <th className="px-3 text-right">Price</th>
                <th className="px-3 text-right">Qty</th>
                <th className="px-3 text-right">Filled</th>
                <th className="px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {history.slice(0, 10).map((o) => (
                <tr key={o.id} className="hover:bg-white/[0.01]">
                  <td className="py-3 px-3 text-white/50 text-[10px]">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 font-sans font-bold text-white">{o.marketSymbol}</td>
                  <td className={`px-3 font-sans font-bold ${o.side === 'BUY' ? 'text-up' : 'text-down'}`}>{o.side}</td>
                  <td className="px-3 text-white/60 font-sans">{o.type}</td>
                  <td className="px-3 text-right text-white">{o.price}</td>
                  <td className="px-3 text-right text-white/70">{o.quantity}</td>
                  <td className="px-3 text-right text-white/50">{o.filledQuantity}</td>
                  <td className="px-3">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </UserShell>
  );
}
