'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, Row, StatusBadge } from '@/components/ui';

function sevColor(s: string) {
  return s === 'ERROR' ? 'text-red-400' : s === 'WARNING' ? 'text-amber-400' : 'text-brand';
}

function DetailInner() {
  const ready = useGuard('admin');
  const reportId = useSearchParams().get('id') ?? '';
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ['fiu-report', reportId], queryFn: () => adminApi.fiuReport(reportId), enabled: ready && !!reportId, retry: false });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['fiu-report', reportId] });

  const validateMut = useMutation({ mutationFn: () => adminApi.fiuReportValidate(reportId), onSuccess: invalidate });
  const exportMut = useMutation({ mutationFn: () => adminApi.fiuReportExport(reportId) });
  const archiveMut = useMutation({ mutationFn: () => adminApi.fiuReportStatus(reportId, { status: 'ARCHIVED' }), onSuccess: invalidate });

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">FIU Draft Report</h1>
        <Link href="/admin/compliance/fiu" className="text-xs text-brand hover:underline">← All reports</Link>
      </div>

      {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {q.data && (() => {
        const r = q.data.data;
        const canExport = r.errorCount === 0 && (r.status === 'READY_FOR_INTERNAL_REVIEW' || r.status === 'EXPORTED_DRAFT');
        return (
          <>
            <Card className="mb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} />
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">{r.submissionState}</span>
              </div>
              <Row label="Type" value={r.reportType.replace(/_/g, ' ')} />
              <Row label="Label" value={<span className="font-mono text-[11px]">{r.label}</span>} />
              <Row label="Errors / Warnings" value={`${r.errorCount} / ${r.warningCount}`} />
              <Row label="Checksum" value={<span className="font-mono text-[11px]">{r.checksum ?? '—'}</span>} />
              <Row label="Subject user" value={r.scope.userId ?? '—'} />
              {r.scope.caseId ? <Row label="Case" value={r.scope.caseId} /> : null}
              {r.scope.evidencePackId ? <Row label="Evidence pack" value={r.scope.evidencePackId} /> : null}
              {r.narrative ? <p className="mt-1 text-xs text-muted">Narrative: {r.narrative}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => validateMut.mutate()} disabled={validateMut.isPending}>Validate</Button>
                <Button variant="secondary" onClick={() => exportMut.mutate()} disabled={exportMut.isPending || !canExport}>Export draft JSON</Button>
                <Button variant="danger" onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}>Archive</Button>
              </div>
              {!canExport && <p className="mt-2 text-[11px] text-muted">Validate with zero ERROR issues before export.</p>}
            </Card>

            <Card className="mb-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Validation issues ({r.issues.length})</h2>
              {r.issues.length === 0 ? <p className="text-sm text-muted">No issues yet — run Validate.</p> : (
                <div className="space-y-1">
                  {r.issues.map((i) => (
                    <div key={i.id} className="flex items-start justify-between rounded border border-line/60 px-2 py-1 text-xs">
                      <span><span className={`font-bold ${sevColor(i.severity)}`}>{i.severity}</span> · {i.message}</span>
                      <span className="font-mono text-[10px] text-muted">{i.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Items ({r.items.length})</h2>
              {r.items.length === 0 ? <p className="text-sm text-muted">No items.</p> : (
                <div className="space-y-2">
                  {r.items.map((it) => (
                    <details key={it.id} className="rounded-lg border border-line bg-panel-2 p-2">
                      <summary className="flex cursor-pointer items-center justify-between text-sm"><span className="text-ink">{it.title}</span><span className="font-mono text-[10px] text-muted">{it.itemType}</span></summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded bg-panel p-2 text-[11px] text-muted">{JSON.stringify(it.data, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              )}
            </Card>
          </>
        );
      })()}
    </main>
  );
}

export default function AdminFiuDetailPage() {
  return (
    <>
      <AdminNav />
      <Suspense fallback={<main className="mx-auto max-w-4xl px-4 py-10"><p className="text-sm text-muted">Loading…</p></main>}>
        <DetailInner />
      </Suspense>
    </>
  );
}
