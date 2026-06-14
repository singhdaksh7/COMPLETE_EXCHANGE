'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Button, Alert, Select, StatusBadge } from '@/components/ui';
import type { CryptoWithdrawal } from '@/lib/types';

const STATUSES = [
  '',
  'PENDING_APPROVAL',
  'APPROVED',
  'BROADCAST',
  'CONFIRMING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
];

export default function AdminWithdrawalsPage() {
  const ready = useGuard('admin');
  const [status, setStatus] = useState('');

  const q = useQuery({
    queryKey: ['admin-withdrawals', status || 'queue'],
    queryFn: () => adminApi.withdrawals({ status: status || undefined, limit: 50 }),
    enabled: ready,
  });

  if (!ready) return null;
  const data = q.data?.data;

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Withdrawal Queue</h1>

        <Card>
          <div className="mb-3 flex items-center gap-3">
            <div className="w-56">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s || 'Pending queue (default)'}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={() => q.refetch()}>Refresh</Button>
          </div>

          {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

          {data && (data.items.length === 0 ? (
            <p className="text-sm text-gray-500">Queue is empty.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">To</th>
                  <th className="pr-2 font-medium">Amount</th>
                  <th className="pr-2 font-medium">Net</th>
                  <th className="pr-2 font-medium">Status</th>
                  <th className="font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((w) => (
                  <QueueRow key={w.id} item={w} />
                ))}
              </tbody>
            </table>
          ))}
        </Card>
      </main>
    </>
  );
}

function QueueRow({ item }: { item: CryptoWithdrawal }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const approve = useMutation({
    mutationFn: () => adminApi.approveWithdrawal(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }),
  });
  const reject = useMutation({
    mutationFn: () => adminApi.rejectWithdrawal(item.id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }),
  });

  const decidable = item.status === 'PENDING_APPROVAL';

  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-3 pr-2 font-mono text-xs">{item.toAddress.slice(0, 12)}…</td>
      <td className="pr-2">{item.amount}</td>
      <td className="pr-2">{item.netAmount}</td>
      <td className="pr-2">
        <StatusBadge status={item.status} />
      </td>
      <td className="py-3">
        {decidable ? (
          <div className="flex flex-col items-start gap-1">
            <input
              placeholder="reason (to reject)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-56 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                Approve
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-500"
                onClick={() => reject.mutate()}
                disabled={reject.isPending || !reason}
              >
                Reject
              </Button>
            </div>
            {(approve.isError || reject.isError) && (
              <span className="text-xs text-red-600">
                {errorMessage(approve.error ?? reject.error)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}
