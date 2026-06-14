'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
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
    <>
      <UserNav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Orders</h1>

        <Card className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Open orders</h2>
          {openQ.isError && <Alert>{errorMessage(openQ.error)}</Alert>}
          {cancel.isError && (
            <div className="mb-2">
              <Alert>{errorMessage(cancel.error)}</Alert>
            </div>
          )}
          <OrderTable
            orders={openOrders}
            emptyText="No open orders."
            onCancel={(id) => cancel.mutate(id)}
            cancelling={cancel.isPending}
          />
        </Card>

        <Card className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Order history</h2>
          {historyQ.isError && <Alert>{errorMessage(historyQ.error)}</Alert>}
          <OrderTable orders={history} emptyText="No past orders." />
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold">Trade history</h2>
          {tradesQ.isError && <Alert>{errorMessage(tradesQ.error)}</Alert>}
          <TradeTable trades={trades} />
        </Card>
      </main>
    </>
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
    return <p className="text-sm text-gray-500">{emptyText}</p>;

  return (
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
            <th>Created</th>
            {onCancel && <th></th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
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
              <td className="text-xs text-gray-500">
                {new Date(o.createdAt).toLocaleString()}
              </td>
              {onCancel && (
                <td className="text-right">
                  {['OPEN', 'PARTIALLY_FILLED', 'PENDING'].includes(o.status) ? (
                    <button
                      onClick={() => onCancel(o.id)}
                      disabled={cancelling}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
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
    return <p className="text-sm text-gray-500">No trades yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-gray-500">
          <tr>
            <th className="py-1">Market</th>
            <th>Side</th>
            <th>Role</th>
            <th className="text-right">Price</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Total</th>
            <th className="text-right">Fee</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-t border-gray-100">
              <td className="py-2">{t.marketSymbol}</td>
              <td className={t.side === 'BUY' ? 'text-green-600' : 'text-red-600'}>
                {t.side}
              </td>
              <td className="text-gray-500">{t.role ?? '—'}</td>
              <td className="text-right font-mono">{t.price}</td>
              <td className="text-right font-mono">{t.quantity}</td>
              <td className="text-right font-mono">{t.quoteAmount}</td>
              <td className="text-right font-mono">
                {t.fee ? `${t.fee} ${t.feeAsset ?? ''}` : '—'}
              </td>
              <td className="text-xs text-gray-500">
                {new Date(t.executedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
