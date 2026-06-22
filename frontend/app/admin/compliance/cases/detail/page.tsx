'use client';

import { Suspense, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, Select, StatusBadge } from '@/components/ui';
import type { ComplianceAlertStatus, ComplianceCaseStatus } from '@/lib/types';

const CASE_STATUSES: ComplianceCaseStatus[] = ['OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED', 'CLOSED'];
const ALERT_STATUSES: ComplianceAlertStatus[] = ['OPEN', 'IN_REVIEW', 'LINKED_TO_CASE', 'DISMISSED', 'RESOLVED'];

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function DetailInner() {
  const ready = useGuard('admin');
  const caseId = useSearchParams().get('id') ?? '';
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<ComplianceCaseStatus>('IN_REVIEW');
  const [note, setNote] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const q = useQuery({
    queryKey: ['compliance-case', caseId],
    queryFn: () => adminApi.complianceCase(caseId),
    enabled: ready && !!caseId,
    retry: false,
  });
  const meQ = useQuery({ queryKey: ['admin-me'], queryFn: () => adminApi.me(), enabled: ready, retry: false });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['compliance-case', caseId] });

  const statusMut = useMutation({
    mutationFn: () => adminApi.complianceCaseStatus(caseId, { status, note: note || undefined }),
    onSuccess: () => { setMsg(`Status updated to ${status}`); setNote(''); invalidate(); },
    onError: (e) => setMsg(errorMessage(e)),
  });
  const assignMut = useMutation({
    mutationFn: (adminId: string | null) => adminApi.complianceCaseAssign(caseId, adminId),
    onSuccess: () => { setMsg('Assignment updated'); invalidate(); },
    onError: (e) => setMsg(errorMessage(e)),
  });
  const noteMut = useMutation({
    mutationFn: () => adminApi.complianceCaseNote(caseId, noteBody),
    onSuccess: () => { setMsg('Note added'); setNoteBody(''); invalidate(); },
    onError: (e) => setMsg(errorMessage(e)),
  });
  const alertMut = useMutation({
    mutationFn: (v: { alertId: string; status: ComplianceAlertStatus }) =>
      adminApi.complianceAlertStatus(v.alertId, { status: v.status }),
    onSuccess: () => { setMsg('Alert updated'); invalidate(); },
    onError: (e) => setMsg(errorMessage(e)),
  });
  const exportMut = useMutation({
    mutationFn: () => adminApi.complianceCaseExportStr(caseId),
    onError: (e) => setMsg(errorMessage(e)),
  });
  const taskMut = useMutation({
    mutationFn: (scopeUserId: string) =>
      adminApi.workspaceTaskCreate({ type: 'STR_CASE_REVIEW', title: 'Review STR case', caseId, scopeUserId, slaMinutes: 1440, priority: 'HIGH' }),
    onSuccess: () => setMsg('Review task created in the compliance workspace.'),
    onError: (e) => setMsg(errorMessage(e)),
  });

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Compliance Case</h1>
        <Link href="/admin/compliance/cases" className="text-xs text-brand hover:underline">← All cases</Link>
      </div>

      {msg && <div className="mb-4"><Alert kind="info">{msg}</Alert></div>}
      {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {q.data && (() => {
        const c = q.data.data;
        return (
          <>
            <Section
              title="Case"
              action={
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => taskMut.mutate(c.userId)} disabled={taskMut.isPending}>Create review task</Button>
                  <Button variant="secondary" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
                    {exportMut.isPending ? 'Exporting…' : 'Export STR draft (JSON)'}
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-3">
                <div><span className="text-muted">Priority: </span><StatusBadge status={c.priority} /></div>
                <div><span className="text-muted">Status: </span><StatusBadge status={c.status} /></div>
                <div><span className="text-muted">Type: </span>{c.type.replace(/_/g, ' ')}</div>
                <div className="col-span-2"><span className="text-muted">User: </span>
                  <Link href={`/admin/compliance/users/detail?id=${c.userId}`} className="text-brand hover:underline">{c.email}</Link>
                </div>
                <div><span className="text-muted">Assigned: </span>{c.assignedToAdminId ? c.assignedToAdminId.slice(0, 8) : '—'}</div>
              </div>
              <p className="mt-3 text-sm text-ink"><span className="text-muted">Title: </span>{c.title}</p>
              {c.summary && <p className="mt-1 text-sm text-muted">{c.summary}</p>}
              <p className="mt-1 text-xs text-muted">
                Opened {c.openedByAdminId ? 'by admin' : 'automatically'} · {new Date(c.createdAt).toLocaleString()}
              </p>
            </Section>

            <Section title="Workflow">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-44">
                  <label className="mb-1 block text-xs text-muted">Set status</label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value as ComplianceCaseStatus)}>
                    {CASE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                <input
                  className="min-w-[160px] flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink"
                  placeholder="Status note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button onClick={() => statusMut.mutate()} disabled={statusMut.isPending}>Apply status</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <Button
                  variant="secondary"
                  disabled={assignMut.isPending || !meQ.data}
                  onClick={() => assignMut.mutate(meQ.data?.data.admin.id ?? null)}
                >
                  Assign to me
                </Button>
                <Button variant="secondary" disabled={assignMut.isPending} onClick={() => assignMut.mutate(null)}>
                  Unassign
                </Button>
              </div>
            </Section>

            <Section title={`Alerts (${c.alerts.length})`}>
              {c.alerts.length === 0 ? <p className="text-sm text-muted">No linked alerts.</p> : (
                <div className="space-y-2">
                  {c.alerts.map((a) => (
                    <div key={a.id} className="rounded-lg border border-line bg-panel-2 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={a.priority} />
                          <span className="text-sm font-semibold text-ink">{a.title}</span>
                          <StatusBadge status={a.status} />
                        </div>
                        <span className="font-mono text-xs text-muted">score {a.score}</span>
                      </div>
                      {a.description && <p className="mt-1 text-xs text-muted">{a.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-muted">{a.type.replace(/_/g, ' ')}</span>
                        <Select
                          value={a.status}
                          onChange={(e) => alertMut.mutate({ alertId: a.id, status: e.target.value as ComplianceAlertStatus })}
                        >
                          {ALERT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Add note">
              <div className="flex flex-col gap-2">
                <textarea
                  className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink"
                  rows={2}
                  placeholder="Investigation note"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                />
                <div>
                  <Button onClick={() => noteMut.mutate()} disabled={noteMut.isPending || !noteBody.trim()}>Add note</Button>
                </div>
              </div>
            </Section>

            <Section title={`Notes (${c.notes.length})`}>
              {c.notes.length === 0 ? <p className="text-sm text-muted">No notes.</p> : (
                <div className="space-y-2">
                  {c.notes.map((n) => (
                    <div key={n.id} className="rounded-lg border border-line bg-panel-2 p-2 text-xs">
                      <p className="text-ink whitespace-pre-wrap">{n.body}</p>
                      <p className="mt-1 text-muted">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Timeline">
              {c.events.length === 0 ? <p className="text-sm text-muted">No events.</p> : (
                <ul className="space-y-1 text-xs">
                  {c.events.map((e) => (
                    <li key={e.id} className="flex justify-between border-b border-line/40 py-1">
                      <span className="text-ink">{e.action}{e.actorAdminId ? '' : ' (system)'}</span>
                      <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        );
      })()}
    </main>
  );
}

export default function AdminComplianceCaseDetailPage() {
  return (
    <>
      <AdminNav />
      <Suspense fallback={<main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-muted">Loading…</p></main>}>
        <DetailInner />
      </Suspense>
    </>
  );
}
