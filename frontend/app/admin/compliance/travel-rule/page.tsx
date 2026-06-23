'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Card, EmptyState, Select, StatusBadge } from '@/components/ui';
import type { TravelRuleDirection, TravelRuleStatus } from '@/lib/types';

const STATUSES = ['', 'NOT_REQUIRED', 'REQUIRED', 'PENDING_INFO', 'READY', 'SENT_MOCK', 'FAILED', 'EXEMPTED'];
const DIRECTIONS = ['', 'INBOUND', 'OUTBOUND'];

export default function AdminTravelRulePage() {
  const ready = useGuard('admin');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');

  const q = useQuery({
    queryKey: ['travel-rule', status, direction],
    queryFn: () => adminApi.travelRuleTransfers({ status: (status || undefined) as TravelRuleStatus | undefined, direction: (direction || undefined) as TravelRuleDirection | undefined }),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const items = q.data?.data.items ?? [];

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Travel Rule</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/compliance" className="text-xs text-brand hover:underline">← Compliance dashboard</Link>
            <Link href="/admin/compliance/wallet-risk" className="text-xs text-brand hover:underline">Wallet Risk →</Link>
          </div>
        </div>
        <p className="mb-4 text-xs text-muted">
          Travel Rule data-collection records (mock lifecycle). <span className="text-amber-400 font-semibold">No real Travel Rule message is ever transmitted.</span>
        </p>

        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((x) => <option key={x} value={x}>{x || 'All statuses'}</option>)}</Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Direction</label>
              <Select value={direction} onChange={(e) => setDirection(e.target.value)}>{DIRECTIONS.map((x) => <option key={x} value={x}>{x || 'All directions'}</option>)}</Select>
            </div>
          </div>
        </Card>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {!q.isLoading && items.length === 0 ? (
          <EmptyState title="No Travel Rule records" hint="Records are created by the Travel Rule foundation when transfers cross the threshold." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Direction</th>
                    <th className="py-2 pr-3">Asset</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Counterparty</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className="border-b border-line/60">
                      <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                      <td className="py-2 pr-3 text-muted">{t.direction}</td>
                      <td className="py-2 pr-3">{t.asset}</td>
                      <td className="py-2 pr-3 font-mono">{t.amount}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">{t.counterpartyAddress ? `${t.counterpartyAddress.slice(0, 16)}…` : '—'}</td>
                      <td className="py-2 pr-3 text-muted">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="py-2"><Link href={`/admin/compliance/travel-rule/detail?id=${t.id}`} className="text-brand hover:underline">Open →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
