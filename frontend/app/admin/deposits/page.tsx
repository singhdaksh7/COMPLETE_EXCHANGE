'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Button, Alert, Select, StatusBadge } from '@/components/ui';

const STATUSES = ['', 'INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED'];

export default function AdminDepositsPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  // Land on the actionable manual queue by default; switch to "All" to audit.
  const [status, setStatus] = useState('PENDING');
  const [actionError, setActionError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['admin-deposits', status || 'all'],
    queryFn: () => adminApi.deposits({ status: status || undefined, limit: 50 }),
    enabled: ready,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['admin-deposits'] });

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approveDeposit(id),
    onSuccess: invalidate,
    onError: (e) => setActionError(errorMessage(e)),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.rejectDeposit(id, reason),
    onSuccess: invalidate,
    onError: (e) => setActionError(errorMessage(e)),
  });

  if (!ready) return null;
  const data = q.data?.data;
  const busy = approve.isPending || reject.isPending;

  function onApprove(id: string) {
    setActionError(null);
    if (window.confirm('Approve this deposit and credit the user’s INR balance?')) {
      approve.mutate(id);
    }
  }

  function onReject(id: string) {
    setActionError(null);
    const reason = window.prompt('Reason for rejecting this deposit:')?.trim();
    if (reason) reject.mutate({ id, reason });
  }

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">INR Deposits</h1>

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

          {actionError && <Alert>{actionError}</Alert>}
          {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

          {data && (data.items.length === 0 ? (
            <p className="text-sm text-gray-500">No deposits.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Ref / Order</th>
                  <th className="pr-2 font-medium">User</th>
                  <th className="pr-2 font-medium">Amount</th>
                  <th className="pr-2 font-medium">UTR</th>
                  <th className="pr-2 font-medium">Method</th>
                  <th className="pr-2 font-medium">Status</th>
                  <th className="pr-2 font-medium">Created</th>
                  <th className="pr-2 font-medium">Reviewed</th>
                  <th className="font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => {
                  const isManual = d.provider === 'MANUAL';
                  const isPending = d.status === 'PENDING';
                  return (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-mono text-xs">
                        {d.providerOrderId ?? d.id.slice(0, 8)}
                      </td>
                      <td className="pr-2 font-mono text-xs">{d.userId.slice(0, 8)}</td>
                      <td className="pr-2">₹{d.amount}</td>
                      <td className="pr-2 font-mono text-xs">{d.utr ?? '—'}</td>
                      <td className="pr-2">{d.method ?? (isManual ? '—' : 'Gateway')}</td>
                      <td className="pr-2">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="pr-2 text-gray-500">
                        {new Date(d.createdAt).toLocaleString()}
                      </td>
                      <td className="pr-2 text-gray-500">
                        {d.reviewedAt ? new Date(d.reviewedAt).toLocaleString() : '—'}
                      </td>
                      <td>
                        {isManual && isPending ? (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => onApprove(d.id)}
                              disabled={busy}
                            >
                              Approve
                            </Button>
                            <Button
                              onClick={() => onReject(d.id)}
                              disabled={busy}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {d.rejectionReason ?? '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        </Card>
      </main>
    </>
  );
}
