'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Card, EmptyState, Select, StatusBadge } from '@/components/ui';

const KYC_STATUSES = ['', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_MORE_INFO', 'APPROVED', 'REJECTED', 'EXPIRED'];
const RISK_LEVELS = ['', 'LOW', 'MEDIUM', 'HIGH', 'PROHIBITED'];

export default function AdminComplianceQueuePage() {
  const ready = useGuard('admin');
  const [status, setStatus] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [email, setEmail] = useState('');

  const q = useQuery({
    queryKey: ['compliance-users', status, riskLevel, email],
    queryFn: () => adminApi.complianceUsers({ status: status || undefined, riskLevel: riskLevel || undefined, email: email || undefined }),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const items = q.data?.data.items ?? [];

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Compliance Review Queue</h1>
          <Link href="/admin/compliance" className="text-xs text-brand hover:underline">← Compliance dashboard</Link>
        </div>
        <p className="mb-4 text-xs text-muted">
          FIU/PMLA review. Screening &amp; liveness may be <span className="text-amber-400 font-semibold">mock</span> in staging.
        </p>

        <Card className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">KYC status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {KYC_STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Risk level</label>
              <Select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
                {RISK_LEVELS.map((s) => <option key={s} value={s}>{s || 'All risk'}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Email</label>
              <input
                className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="search by email"
              />
            </div>
          </div>
        </Card>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {!q.isLoading && items.length === 0 ? (
          <EmptyState title="No compliance profiles" hint="No users match these filters yet." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Risk</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Liveness</th>
                    <th className="py-2 pr-3">Screening</th>
                    <th className="py-2 pr-3">Country</th>
                    <th className="py-2 pr-3">Submitted</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <tr key={u.userId} className="border-b border-line/60">
                      <td className="py-2 pr-3 text-ink">{u.email}</td>
                      <td className="py-2 pr-3"><StatusBadge status={u.status} /></td>
                      <td className="py-2 pr-3"><StatusBadge status={`${u.riskLevel} RISK`} /></td>
                      <td className="py-2 pr-3 font-mono">{u.riskScore}</td>
                      <td className="py-2 pr-3"><StatusBadge status={u.livenessStatus} /></td>
                      <td className="py-2 pr-3"><StatusBadge status={u.screeningStatus} /></td>
                      <td className="py-2 pr-3">{u.countryOfResidence ?? '—'}</td>
                      <td className="py-2 pr-3 text-muted">{new Date(u.submittedAt).toLocaleDateString()}</td>
                      <td className="py-2">
                        <Link href={`/admin/compliance/users/detail?id=${u.userId}`} className="text-brand hover:underline">Review →</Link>
                      </td>
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
