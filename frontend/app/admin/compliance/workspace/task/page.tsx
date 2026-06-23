'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, Row, Select, StatusBadge } from '@/components/ui';
import type { ComplianceTaskStatus } from '@/lib/types';

const STATUSES: ComplianceTaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_INFO', 'ESCALATED', 'COMPLETED', 'CANCELLED'];

function DetailInner() {
  const ready = useGuard('admin');
  const taskId = useSearchParams().get('id') ?? '';
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<ComplianceTaskStatus>('IN_PROGRESS');
  const [comment, setComment] = useState('');

  const q = useQuery({ queryKey: ['ws-task', taskId], queryFn: () => adminApi.workspaceTask(taskId), enabled: ready && !!taskId, retry: false });
  const meQ = useQuery({ queryKey: ['admin-me'], queryFn: () => adminApi.me(), enabled: ready, retry: false });
  const checklistQ = useQuery({ queryKey: ['ws-task-checklist', taskId], queryFn: () => adminApi.taskChecklist(taskId), enabled: ready && !!taskId, retry: false });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['ws-task', taskId] }); qc.invalidateQueries({ queryKey: ['ws-task-checklist', taskId] }); };

  const statusMut = useMutation({ mutationFn: () => adminApi.workspaceTaskStatus(taskId, { status }), onSuccess: () => { setMsg(`Status set to ${status}`); invalidate(); }, onError: (e) => setMsg(errorMessage(e)) });
  const assignMut = useMutation({ mutationFn: (adminId: string | null) => adminApi.workspaceTaskAssign(taskId, adminId), onSuccess: () => { setMsg('Assignment updated'); invalidate(); }, onError: (e) => setMsg(errorMessage(e)) });
  const commentMut = useMutation({ mutationFn: () => adminApi.workspaceTaskComment(taskId, comment), onSuccess: () => { setMsg('Comment added'); setComment(''); invalidate(); }, onError: (e) => setMsg(errorMessage(e)) });
  const checklistMut = useMutation({
    mutationFn: (complete: boolean) => {
      const tpl = checklistQ.data?.data.templates[0];
      const answers = (tpl?.items ?? []).map((it) => ({ key: it.key, value: true }));
      return adminApi.taskChecklistSave(taskId, { templateId: tpl?.id, answers, complete });
    },
    onSuccess: () => { setMsg('Checklist saved'); invalidate(); },
    onError: (e) => setMsg(errorMessage(e)),
  });

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Compliance Task</h1>
        <Link href="/admin/compliance/workspace" className="text-xs text-brand hover:underline">← Workspace</Link>
      </div>
      {msg && <div className="mb-4"><Alert>{msg}</Alert></div>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {q.data && (() => {
        const t = q.data.data;
        const tpl = checklistQ.data?.data.templates[0];
        return (
          <>
            <Card className="mb-4">
              <div className="mb-2 flex items-center gap-2"><StatusBadge status={t.priority} /><StatusBadge status={t.status} />{t.liveSlaStatus ? <StatusBadge status={t.liveSlaStatus} /> : null}</div>
              <Row label="Type" value={t.type.replace(/_/g, ' ')} />
              <Row label="Title" value={t.title} />
              {t.scopeUserId ? <Row label="User" value={<Link href={`/admin/compliance/users/detail?id=${t.scopeUserId}`} className="text-brand hover:underline">{t.user?.email ?? t.scopeUserId.slice(0, 8)}</Link>} /> : null}
              {t.caseId ? <Row label="Case" value={<Link href={`/admin/compliance/cases/detail?id=${t.caseId}`} className="text-brand hover:underline">{t.caseId.slice(0, 8)}…</Link>} /> : null}
              {t.fiuReportId ? <Row label="FIU report" value={<Link href={`/admin/compliance/fiu/detail?id=${t.fiuReportId}`} className="text-brand hover:underline">{t.fiuReportId.slice(0, 8)}…</Link>} /> : null}
              <Row label="Assigned" value={t.assignedToAdminId ? t.assignedToAdminId.slice(0, 8) : '—'} />
              {t.dueAt ? <Row label="Due" value={new Date(t.dueAt).toLocaleString()} /> : null}
            </Card>

            <Card className="mb-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">Workflow</h2>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-44"><Select value={status} onChange={(e) => setStatus(e.target.value as ComplianceTaskStatus)}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
                <Button onClick={() => statusMut.mutate()} disabled={statusMut.isPending}>Apply status</Button>
                <Button variant="secondary" disabled={assignMut.isPending || !meQ.data} onClick={() => assignMut.mutate(meQ.data?.data.admin.id ?? null)}>Assign to me</Button>
                <Button variant="secondary" disabled={assignMut.isPending} onClick={() => assignMut.mutate(null)}>Unassign</Button>
              </div>
            </Card>

            {tpl ? (
              <Card className="mb-4">
                <h2 className="mb-1 text-sm font-semibold text-ink">Checklist: {tpl.name}{tpl.requiredForCompletion ? ' (required)' : ''}</h2>
                <ul className="list-disc pl-4 text-xs text-muted">{tpl.items.map((it) => <li key={it.key}>{it.label}</li>)}</ul>
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" onClick={() => checklistMut.mutate(false)} disabled={checklistMut.isPending}>Save draft</Button>
                  <Button onClick={() => checklistMut.mutate(true)} disabled={checklistMut.isPending}>Complete checklist</Button>
                </div>
              </Card>
            ) : null}

            <Card className="mb-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">Add comment</h2>
              <textarea className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="mt-2"><Button onClick={() => commentMut.mutate()} disabled={commentMut.isPending || !comment.trim()}>Comment</Button></div>
            </Card>

            <Card>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Timeline</h2>
              <ul className="space-y-1 text-xs">{t.events.map((e) => (
                <li key={e.id} className="flex justify-between border-b border-line/40 py-1">
                  <span className="text-ink">{e.action}{(e.metadata as { body?: string })?.body ? `: ${(e.metadata as { body?: string }).body}` : ''}</span>
                  <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>
                </li>
              ))}</ul>
            </Card>
          </>
        );
      })()}
    </main>
  );
}

export default function AdminWorkspaceTaskPage() {
  return (
    <>
      <Suspense fallback={<main className="mx-auto max-w-4xl px-4 py-10"><p className="text-sm text-muted">Loading…</p></main>}>
        <DetailInner />
      </Suspense>
    </>
  );
}
