'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Button, Alert, Select, StatusBadge } from '@/components/ui';

const STATUSES = ['', 'INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED'];

export default function AdminDepositsPage() {
  const ready = useGuard('admin');
  const [status, setStatus] = useState('');

  const q = useQuery({
    queryKey: ['admin-deposits', status || 'all'],
    queryFn: () => adminApi.deposits({ status: status || undefined, limit: 50 }),
    enabled: ready,
  });

  if (!ready) return null;
  const data = q.data?.data;

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">INR Deposit Monitoring</h1>

        <Card>
          <div className="mb-3 flex items-center gap-3">
            <div className="w-48">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s || 'All statuses'}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={() => q.refetch()}>Refresh</Button>
          </div>

          {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

          {data && (data.items.length === 0 ? (
            <p className="text-sm text-gray-500">No deposits.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Order</th>
                  <th className="pr-2 font-medium">Amount</th>
                  <th className="pr-2 font-medium">Payment</th>
                  <th className="pr-2 font-medium">Status</th>
                  <th className="font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-mono text-xs">
                      {d.providerOrderId ?? d.id.slice(0, 8)}
                    </td>
                    <td className="pr-2">₹{d.amount}</td>
                    <td className="pr-2 font-mono text-xs">
                      {d.providerPaymentId ?? '—'}
                    </td>
                    <td className="pr-2">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="text-gray-500">
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </Card>
      </main>
    </>
  );
}
