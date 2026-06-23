'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, Row, StatusBadge } from '@/components/ui';

function DetailInner() {
  const ready = useGuard('admin');
  const packId = useSearchParams().get('id') ?? '';

  const q = useQuery({
    queryKey: ['evidence-pack', packId],
    queryFn: () => adminApi.evidencePack(packId),
    enabled: ready && !!packId,
    retry: false,
  });
  const exportMut = useMutation({ mutationFn: () => adminApi.evidencePackExport(packId) });

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Evidence Pack</h1>
        <Link href="/admin/compliance/evidence-packs" className="text-xs text-brand hover:underline">← All packs</Link>
      </div>

      {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {q.data && (() => {
        const p = q.data.data;
        return (
          <>
            <Card className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <StatusBadge status={p.status} />
                <Button variant="secondary" onClick={() => exportMut.mutate()} disabled={exportMut.isPending || p.status !== 'READY'}>
                  {exportMut.isPending ? 'Exporting…' : 'Export JSON'}
                </Button>
              </div>
              <Row label="Type" value={p.packType.replace(/_/g, ' ')} />
              <Row label="Label" value={<span className="font-mono text-[11px]">{p.label}</span>} />
              <Row label="Items" value={String(p.itemCount)} />
              <Row label="Checksum (SHA-256)" value={<span className="font-mono text-[11px]">{p.checksum ?? '—'}</span>} />
              <Row label="Scope user" value={p.scope.userId ?? '—'} />
              {p.scope.caseId ? <Row label="Scope case" value={p.scope.caseId} /> : null}
              {p.scope.ref ? <Row label="Scope ref" value={p.scope.ref} /> : null}
              <Row label="Created" value={new Date(p.createdAt).toLocaleString()} />
              {p.error ? <p className="text-xs text-red-400">Error: {p.error}</p> : null}
              <p className="mt-2 text-[11px] text-amber-400">
                Internal-only · masked · not an FIU filing.
              </p>
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Items ({p.items.length})</h2>
              {p.items.length === 0 ? (
                <p className="text-sm text-muted">No items.</p>
              ) : (
                <div className="space-y-2">
                  {p.items.map((it) => (
                    <details key={it.id} className="rounded-lg border border-line bg-panel-2 p-2">
                      <summary className="flex cursor-pointer items-center justify-between text-sm">
                        <span className="text-ink">{it.title}</span>
                        <span className="font-mono text-[10px] text-muted">{it.itemType}</span>
                      </summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded bg-panel p-2 text-[11px] text-muted">
                        {JSON.stringify(it.data, null, 2)}
                      </pre>
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

export default function AdminEvidencePackDetailPage() {
  return (
    <>
      <Suspense fallback={<main className="mx-auto max-w-4xl px-4 py-10"><p className="text-sm text-muted">Loading…</p></main>}>
        <DetailInner />
      </Suspense>
    </>
  );
}
