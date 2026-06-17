'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { Card, Alert, StatusBadge } from '@/components/ui';
import type { Order, Trade } from '@/lib/types';

export default function OrdersPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

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

  if (!ready) return null;
  const openOrders = openQ.data?.data.items ?? [];
  const history = historyQ.data?.data.items ?? [];
  const trades = tradesQ.data?.data.items ?? [];

  return (
    <UserShell className="max-w-[1400px] space-y-6">
        
        {/* Header */}
        <div className="mb-8 flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Order Logs Desk</h1>
            <p className="text-xs text-white/50 mt-1">Audit active market orders, cancellations, and completed transaction history.</p>
          </div>
        </div>

        {cancel.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
            {errorMessage(cancel.error)}
          </div>
        )}

        {/* Open Orders */}
        <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
          <h2 className="text-sm font-bold text-white tracking-tight mb-4 border-b border-white/5 pb-2">Open Orders Queue</h2>
          {openQ.isError && <p className="text-xs text-down py-2">{errorMessage(openQ.error)}</p>}
          <OrderTable
            orders={openOrders}
            emptyText="No active open orders found."
            onCancel={(id) => cancel.mutate(id)}
            cancelling={cancel.isPending}
          />
        </div>

        {/* Order History */}
        <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
          <h2 className="text-sm font-bold text-white tracking-tight mb-4 border-b border-white/5 pb-2">Order Execution Ledger</h2>
          {historyQ.isError && <p className="text-xs text-down py-2">{errorMessage(historyQ.error)}</p>}
          <OrderTable orders={history} emptyText="No past execution history." />
        </div>

        {/* Trade History */}
        <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
          <h2 className="text-sm font-bold text-white tracking-tight mb-4 border-b border-white/5 pb-2">Trade Matching Ledger</h2>
          {tradesQ.isError && <p className="text-xs text-down py-2">{errorMessage(tradesQ.error)}</p>}
          <TradeTable trades={trades} />
        </div>
      </UserShell>
  );
}

function OrderTable({
  orders,
  emptyText,
  onCancel,
  cancelling,
}: {
  orders: Order[];
  emptyText: string;
  onCancel?: (id: string) => void;
  cancelling?: boolean;
}) {
  if (orders.length === 0)
    return <p className="text-xs text-white/45 py-4">{emptyText}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] font-bold text-white/45 uppercase tracking-wider border-b border-white/5">
          <tr>
            <th className="py-2">Market</th>
            <th>Side</th>
            <th>Type</th>
            <th className="text-right">Price</th>
            <th className="text-right">Qty / Filled</th>
            <th>Status</th>
            <th>Created</th>
            {onCancel && <th></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-white/[0.01] transition-colors">
              <td className="py-3 font-semibold text-white">{o.marketSymbol}</td>
              <td className={`font-bold ${o.side === 'BUY' ? 'text-up' : 'text-down'}`}>
                {o.side}
              </td>
              <td className="text-white/60">{o.type}</td>
              <td className="text-right font-mono text-gold">{o.price ?? '—'}</td>
              <td className="text-right font-mono text-gold">
                {o.quantity ?? o.quoteBudget ?? '—'} / {o.filledQuantity}
              </td>
              <td>
                <StatusBadge status={o.status} />
              </td>
              <td className="font-mono text-[10px] text-white/40">
                {new Date(o.createdAt).toLocaleString()}
              </td>
              {onCancel && (
                <td className="text-right">
                  {['OPEN', 'PARTIALLY_FILLED', 'PENDING'].includes(o.status) ? (
                    <button
                      onClick={() => onCancel(o.id)}
                      disabled={cancelling}
                      className="text-xs font-bold text-down hover:brightness-110 transition disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0)
    return <p className="text-xs text-white/45 py-4">No matching trades recorded.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] font-bold text-white/45 uppercase tracking-wider border-b border-white/5">
          <tr>
            <th className="py-2">Market</th>
            <th>Side</th>
            <th>Role</th>
            <th className="text-right">Price</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Total</th>
            <th className="text-right">Fee</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {trades.map((t) => (
            <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
              <td className="py-3 font-semibold text-white">{t.marketSymbol}</td>
              <td className={`font-bold ${t.side === 'BUY' ? 'text-up' : 'text-down'}`}>
                {t.side}
              </td>
              <td className="text-white/60">{t.role ?? '—'}</td>
              <td className="text-right font-mono text-gold">{t.price}</td>
              <td className="text-right font-mono text-gold">{t.quantity}</td>
              <td className="text-right font-mono text-gold">{t.quoteAmount}</td>
              <td className="text-right font-mono text-white/60">
                {t.fee ? `${t.fee} ${t.feeAsset ?? ''}` : '—'}
              </td>
              <td className="font-mono text-[10px] text-white/40">
                {new Date(t.executedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
