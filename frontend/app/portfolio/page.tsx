'use client';

import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Alert, Row } from '@/components/ui';
import type { LedgerEntry } from '@/lib/types';

export default function PortfolioPage() {
  const ready = useGuard('user');

  const walletQ = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });
  const inrLedgerQ = useQuery({
    queryKey: ['ledger', 'INR'],
    queryFn: () => userApi.walletLedger('INR', 15),
    enabled: ready,
  });
  const usdtLedgerQ = useQuery({
    queryKey: ['ledger', 'USDT'],
    queryFn: () => userApi.walletLedger('USDT', 15),
    enabled: ready,
  });

  if (!ready) return null;

  const balances = walletQ.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');

  // Merge the two asset ledgers into one recent-activity feed, newest first.
  const activity: LedgerEntry[] = [
    ...(inrLedgerQ.data?.data.items ?? []),
    ...(usdtLedgerQ.data?.data.items ?? []),
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Portfolio</h1>

        {walletQ.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {walletQ.isError && <Alert>{errorMessage(walletQ.error)}</Alert>}

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="mb-1 text-sm font-medium text-gray-500">INR balance</h2>
            <div className="text-3xl font-bold">₹{inr?.available ?? '0'}</div>
            <p className="mt-1 text-xs text-gray-500">
              Locked: ₹{inr?.locked ?? '0'} · Total: ₹{inr?.total ?? '0'}
            </p>
          </Card>
          <Card>
            <h2 className="mb-1 text-sm font-medium text-gray-500">USDT balance</h2>
            <div className="text-3xl font-bold">{usdt?.available ?? '0'}</div>
            <p className="mt-1 text-xs text-gray-500">
              Locked: {usdt?.locked ?? '0'} · Total: {usdt?.total ?? '0'}
            </p>
          </Card>
        </div>

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">All balances</h2>
          {balances.length === 0 ? (
            <p className="text-sm text-gray-500">No balances yet.</p>
          ) : (
            balances.map((b) => (
              <Row
                key={b.asset}
                label={b.asset}
                value={`${b.available} available · ${b.locked} locked`}
              />
            ))
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Recent ledger activity</h2>
          {(inrLedgerQ.isError || usdtLedgerQ.isError) && (
            <Alert>
              {errorMessage(inrLedgerQ.error ?? usdtLedgerQ.error)}
            </Alert>
          )}
          {activity.length === 0 ? (
            <p className="text-sm text-gray-500">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="py-1">Time</th>
                    <th>Kind</th>
                    <th>Asset</th>
                    <th>Direction</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((e) => (
                    <tr key={`${e.asset}-${e.id}`} className="border-t border-gray-100">
                      <td className="py-2 text-xs text-gray-500">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td>{e.kind}</td>
                      <td>{e.asset}</td>
                      <td
                        className={
                          e.direction === 'CREDIT' ? 'text-green-600' : 'text-red-600'
                        }
                      >
                        {e.direction}
                      </td>
                      <td className="text-right font-mono">{e.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
