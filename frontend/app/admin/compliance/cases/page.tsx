'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, EmptyState, Select, StatusBadge } from '@/components/ui';
import type {
  ComplianceCasePriority,
  ComplianceCaseStatus,
  ComplianceCaseType,
} from '@/lib/types';

const STATUSES = ['', 'OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED', 'CLOSED'];
const PRIORITIES = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const TYPES = ['', 'SUSPICIOUS_TRANSACTION', 'HIGH_RISK_USER', 'WALLET_RISK', 'SCREENING_MATCH', 'MANUAL_REVIEW'];

export default function AdminComplianceCasesPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['compliance-cases', status, priority, type],
    queryFn: () =>
      adminApi.complianceCases({
        status: (status || undefined) as ComplianceCaseStatus | undefined,
        priority: (priority || undefined) as ComplianceCasePriority | undefined,
        type: (type || undefined) as ComplianceCaseType | undefined,
      }),
    enabled: ready,
    retry: false,
  });

  const summaryQ = useQuery({
    queryKey: ['compliance-case-summary'],
    queryFn: () => adminApi.complianceCaseSummary(),
    enabled: ready,
    retry: false,
  });

  const runMut = useMutation({
    mutationFn: () => adminApi.complianceMonitoringRun(),
    onSuccess: (res) => {
      const r = res.data;
      setBanner(
        `Monitoring run complete — ${r.usersEvaluated} user(s) evaluated, ` +
          `${r.alertsCreated} new alert(s), ${r.casesCreated} new case(s).`,
      );
      qc.invalidateQueries({ queryKey: ['compliance-cases'] });
      qc.invalidateQueries({ queryKey: ['compliance-case-summary'] });
    },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const items = q.data?.data.items ?? [];
  const s = summaryQ.data?.data;

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Compliance Cases</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/compliance" className="text-xs text-brand hover:underline">← Compliance dashboard</Link>
            <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
              {runMut.isPending ? 'Running…' : 'Run monitoring'}
            </Button>
          </div>
        </div>
        <p className="mb-4 text-xs text-muted">
          Rule-based suspicious-transaction monitoring &amp; STR draft workflow. Detection-only — it never blocks
          trading or withdrawals. Values may be <span className="text-amber-400 font-semibold">mock</span> in staging.
        </p>

        {banner && <div className="mb-4"><Alert kind="info">{banner}</Alert></div>}

        {s && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Open cases', val: s.openCases },
              { label: 'High/critical', val: s.highCriticalCases },
              { label: 'Open alerts', val: s.openAlerts },
              { label: 'STR drafted', val: s.strDrafted },
            ].map((c) => (
              <Card key={c.label}>
                <div className="text-2xl font-semibold text-ink">{c.val}</div>
                <div className="text-xs text-muted">{c.label}</div>
              </Card>
            ))}
          </div>
        )}

        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((x) => <option key={x} value={x}>{x || 'All statuses'}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Priority</label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((x) => <option key={x} value={x}>{x || 'All priorities'}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((x) => <option key={x} value={x}>{x ? x.replace(/_/g, ' ') : 'All types'}</option>)}
              </Select>
            </div>
          </div>
        </Card>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {!q.isLoading && items.length === 0 ? (
          <EmptyState title="No compliance cases" hint="Run monitoring to generate alerts and auto-open cases." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Priority</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Alerts</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} className="border-b border-line/60">
                      <td className="py-2 pr-3"><StatusBadge status={c.priority} /></td>
                      <td className="py-2 pr-3"><StatusBadge status={c.status} /></td>
                      <td className="py-2 pr-3 text-muted">{c.type.replace(/_/g, ' ')}</td>
                      <td className="py-2 pr-3 text-ink">{c.email}</td>
                      <td className="py-2 pr-3 text-ink">{c.title}</td>
                      <td className="py-2 pr-3 font-mono">{c.alertCount}</td>
                      <td className="py-2 pr-3 text-muted">{new Date(c.createdAt).toLocaleString()}</td>
                      <td className="py-2">
                        <Link href={`/admin/compliance/cases/detail?id=${c.id}`} className="text-brand hover:underline">Open →</Link>
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
