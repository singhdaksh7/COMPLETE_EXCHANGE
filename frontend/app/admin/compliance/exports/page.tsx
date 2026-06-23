'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Card, EmptyState } from '@/components/ui';

export default function AdminComplianceExportsPage() {
  const ready = useGuard('admin');
  const q = useQuery({
    queryKey: ['compliance-export-events'],
    queryFn: () => adminApi.complianceExportEvents(),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const items = q.data?.data.items ?? [];

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Compliance Export Log</h1>
          <Link href="/admin/compliance/evidence-packs" className="text-xs text-brand hover:underline">← Evidence packs</Link>
        </div>
        <p className="mb-4 text-xs text-muted">Append-only audit of every compliance export (accountability trail).</p>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {!q.isLoading && items.length === 0 ? (
          <EmptyState title="No export events" hint="Exports are logged here when packs are downloaded." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Pack</th>
                    <th className="py-2 pr-3">Checksum</th>
                    <th className="py-2 pr-3">Admin</th>
                    <th className="py-2 pr-3">When</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => (
                    <tr key={e.id} className="border-b border-line/60">
                      <td className="py-2 pr-3 text-ink">{e.exportType.replace(/_/g, ' ')}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">{e.packId ? `${e.packId.slice(0, 8)}…` : '—'}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">{e.checksum ? `${e.checksum.slice(0, 12)}…` : '—'}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">{e.adminId ? `${e.adminId.slice(0, 8)}…` : 'system'}</td>
                      <td className="py-2 pr-3 text-muted">{new Date(e.createdAt).toLocaleString()}</td>
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
