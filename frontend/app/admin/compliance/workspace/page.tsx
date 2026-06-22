'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import type { ComplianceTaskStatus, ComplianceTaskType } from '@/lib/types';

const TYPES: ComplianceTaskType[] = ['KYC_REVIEW', 'SCREENING_REVIEW', 'STR_CASE_REVIEW', 'WALLET_RISK_REVIEW', 'TRAVEL_RULE_REVIEW', 'FIU_DRAFT_REVIEW', 'TAX_LEGAL_REVIEW', 'GENERAL_AML_REVIEW'];
const STATUSES = ['', 'OPEN', 'IN_PROGRESS', 'WAITING_INFO', 'ESCALATED', 'COMPLETED', 'CANCELLED'];

export default function AdminWorkspacePage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [taskType, setTaskType] = useState<ComplianceTaskType>('GENERAL_AML_REVIEW');
  const [title, setTitle] = useState('');
  const [sla, setSla] = useState('1440');

  const summaryQ = useQuery({ queryKey: ['ws-summary'], queryFn: () => adminApi.workspaceSummary(), enabled: ready, retry: false });
  const tasksQ = useQuery({
    queryKey: ['ws-tasks', status],
    queryFn: () => adminApi.workspaceTasks({ status: (status || undefined) as ComplianceTaskStatus | undefined }),
    enabled: ready, retry: false,
  });

  const createMut = useMutation({
    mutationFn: () => adminApi.workspaceTaskCreate({ type: taskType, title: title.trim(), slaMinutes: sla ? Number(sla) : undefined }),
    onSuccess: () => { setBanner('Task created.'); setTitle(''); qc.invalidateQueries({ queryKey: ['ws-tasks'] }); qc.invalidateQueries({ queryKey: ['ws-summary'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const s = summaryQ.data?.data;
  const tasks = tasksQ.data?.data.items ?? [];

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Compliance Workspace</h1>
          <div className="flex gap-3">
            <Link href="/admin/compliance/aml" className="text-xs text-brand hover:underline">AML policies →</Link>
            <Link href="/admin/compliance/workspace/approvals" className="text-xs text-brand hover:underline">Approvals →</Link>
          </div>
        </div>
        {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}

        {s && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Open tasks', val: s.openTasks },
              { label: 'Assigned to me', val: s.assignedToMe },
              { label: 'Breached SLA', val: s.breachedSla },
              { label: 'High / critical', val: s.highCritical },
              { label: 'Pending approvals', val: s.pendingApprovals },
              { label: 'FIU need review', val: s.fiuNeedingReview },
            ].map((c) => (
              <Card key={c.label}><div className="text-2xl font-semibold text-ink">{c.val}</div><div className="text-[11px] text-muted">{c.label}</div></Card>
            ))}
          </div>
        )}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Create task</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={taskType} onChange={(e) => setTaskType(e.target.value as ComplianceTaskType)}>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Select>
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="SLA minutes (e.g. 1440)" value={sla} onChange={(e) => setSla(e.target.value)} />
          </div>
          <div className="mt-3"><Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !title}>Create task</Button></div>
        </Card>

        <Card className="mb-4">
          <label className="mb-1 block text-xs text-muted">Filter by status</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((x) => <option key={x} value={x}>{x || 'All statuses'}</option>)}</Select>
        </Card>

        {tasksQ.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {!tasksQ.isLoading && tasks.length === 0 ? (
          <EmptyState title="No tasks" hint="Create a task above or from a case / wallet-risk / FIU detail page." />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">Priority</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Title</th><th className="py-2 pr-3">SLA</th><th className="py-2"></th></tr></thead>
              <tbody>{tasks.map((t) => (
                <tr key={t.id} className="border-b border-line/60">
                  <td className="py-2 pr-3"><StatusBadge status={t.priority} /></td>
                  <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                  <td className="py-2 pr-3 text-muted">{t.type.replace(/_/g, ' ')}</td>
                  <td className="py-2 pr-3 text-ink">{t.title}</td>
                  <td className="py-2 pr-3">{t.slaStatus ? <StatusBadge status={t.slaStatus} /> : <span className="text-muted">—</span>}</td>
                  <td className="py-2"><Link href={`/admin/compliance/workspace/task?id=${t.id}`} className="text-brand hover:underline">Open →</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
