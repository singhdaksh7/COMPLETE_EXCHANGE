'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Card, Button, Alert, Row, StatusBadge } from '@/components/ui';

export default function AdminScannerPage() {
  const ready = useGuard('admin');
  const q = useQuery({
    queryKey: ['admin-scanner-health'],
    queryFn: () => adminApi.scannerHealth(),
    enabled: ready,
    refetchInterval: 5000,
  });

  if (!ready) return null;
  const h = q.data?.data;

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Scanner Health</h1>
          <Button onClick={() => q.refetch()}>Refresh</Button>
        </div>

        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {h && (
          <>
            <Card className="mb-6">
              <Row label="Chain" value={h.chain} />
              <Row label="Provider" value={`${h.provider.name} (${h.provider.mode})`} />
              <Row label="Head block" value={h.headBlock ?? '—'} />
              <Row
                label="Cursor (last scanned)"
                value={h.cursor?.lastScannedBlock ?? '—'}
              />
              <Row label="Safe block" value={h.cursor?.safeBlock ?? '—'} />
              <Row label="Lag (blocks)" value={h.lagBlocks ?? '—'} />
              <Row
                label="Cursor updated"
                value={
                  h.cursor ? new Date(h.cursor.updatedAt).toLocaleString() : '—'
                }
              />
            </Card>

            <Card>
              <h2 className="mb-3 text-lg font-semibold">Deposits by status</h2>
              {Object.keys(h.depositCounts).length === 0 ? (
                <p className="text-sm text-gray-500">No deposits detected yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(h.depositCounts).map(([status, count]) => (
                    <span
                      key={status}
                      className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-1 text-sm"
                    >
                      <StatusBadge status={status} />
                      <span className="font-medium">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </main>
    </>
  );
}
