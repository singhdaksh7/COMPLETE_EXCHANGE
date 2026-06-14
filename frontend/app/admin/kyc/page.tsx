'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Button, Alert, StatusBadge } from '@/components/ui';
import type { AdminKycQueueItem } from '@/lib/types';

export default function AdminKycPage() {
  const ready = useGuard('admin');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const q = useQuery({
    queryKey: ['admin-kyc', cursor ?? 'first'],
    queryFn: () => adminApi.kycQueue({ cursor, limit: 20 }),
    enabled: ready,
  });

  if (!ready) return null;
  const data = q.data?.data;

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">KYC Review Queue</h1>

        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {data && (
          <Card>
            {data.items.length === 0 ? (
              <p className="text-sm text-gray-500">Queue is empty.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-2 font-medium">Email</th>
                    <th className="pr-2 font-medium">Name</th>
                    <th className="pr-2 font-medium">Status</th>
                    <th className="pr-2 font-medium">Submitted</th>
                    <th className="font-medium">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <QueueRow key={item.userId} item={item} />
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-4 flex gap-2">
              <Button onClick={() => setCursor(undefined)} disabled={!cursor}>
                First page
              </Button>
              <Button
                onClick={() => data.nextCursor && setCursor(data.nextCursor)}
                disabled={!data.nextCursor}
              >
                Next page
              </Button>
              <Button onClick={() => q.refetch()}>Refresh</Button>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}

function QueueRow({ item }: { item: AdminKycQueueItem }) {
  const qc = useQueryClient();
  const [tier, setTier] = useState(item.tier || 1);
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') =>
      adminApi.decide(
        item.userId,
        decision === 'APPROVE' ? { decision, tier } : { decision, reason },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-kyc'] }),
  });

  return (
    <tr className="border-b align-top">
      <td className="py-3 pr-2">{item.email}</td>
      <td className="pr-2">{item.fullName ?? '—'}</td>
      <td className="pr-2">
        <StatusBadge status={item.status} />
      </td>
      <td className="pr-2 text-gray-500">
        {new Date(item.submittedAt).toLocaleString()}
      </td>
      <td className="py-3">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Tier</span>
            <input
              type="number"
              min={0}
              max={5}
              value={tier}
              onChange={(e) => setTier(Number(e.target.value))}
              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <input
            placeholder="reason (required to reject)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-56 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={() => m.mutate('APPROVE')} disabled={m.isPending}>
              Approve
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-500"
              onClick={() => m.mutate('REJECT')}
              disabled={m.isPending || !reason}
            >
              Reject
            </Button>
          </div>
          {m.isError && (
            <span className="text-xs text-red-600">{errorMessage(m.error)}</span>
          )}
          {m.isSuccess && (
            <span className="text-xs text-green-600">Saved.</span>
          )}
        </div>
      </td>
    </tr>
  );
}
