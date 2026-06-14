'use client';

import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Alert, Button, Row, StatusBadge } from '@/components/ui';

export default function KycStatusPage() {
  const ready = useGuard('user');
  const q = useQuery({
    queryKey: ['kyc'],
    queryFn: () => userApi.getKyc(),
    enabled: ready,
  });
  const docs = useQuery({
    queryKey: ['kyc-docs'],
    queryFn: () => userApi.listDocuments(),
    enabled: ready,
  });

  if (!ready) return null;
  const k = q.data?.data;

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">KYC Status</h1>
          <Button
            onClick={() => {
              q.refetch();
              docs.refetch();
            }}
          >
            Refresh
          </Button>
        </div>

        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {k && (
          <Card>
            <Row label="Status" value={<StatusBadge status={k.status} />} />
            <Row label="Tier" value={String(k.tier)} />
            <Row label="Full name" value={k.fullName ?? '—'} />
            <Row label="Rejected reason" value={k.rejectedReason ?? '—'} />
            <Row
              label="Reviewed at"
              value={k.reviewedAt ? new Date(k.reviewedAt).toLocaleString() : '—'}
            />
          </Card>
        )}

        {docs.data && (
          <Card className="mt-4">
            <h2 className="mb-2 font-semibold">Documents</h2>
            <ul className="text-sm">
              {docs.data.data.items.map((d) => (
                <li
                  key={d.id}
                  className="flex justify-between border-b border-gray-100 py-1"
                >
                  <span>{d.docType}</span>
                  <StatusBadge status={d.status} />
                </li>
              ))}
              {docs.data.data.items.length === 0 && (
                <li className="text-gray-500">None</li>
              )}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}
