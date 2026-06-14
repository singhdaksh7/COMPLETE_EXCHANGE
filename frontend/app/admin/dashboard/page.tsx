'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Alert, Row } from '@/components/ui';

export default function AdminDashboardPage() {
  const ready = useGuard('admin');
  const q = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me(),
    enabled: ready,
  });

  if (!ready) return null;
  const me = q.data?.data;

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-xl px-4">
        <h1 className="mb-4 text-xl font-semibold">Admin Dashboard</h1>

        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {me && (
          <Card>
            <Row label="Email" value={me.admin.email} />
            <Row label="Status" value={me.admin.status} />
            <Row label="Roles" value={me.roles.join(', ') || '—'} />
            <Row label="Permissions" value={me.permissions.join(', ') || '—'} />
            <div className="mt-4 text-sm">
              <Link href="/admin/kyc" className="underline">
                Go to KYC review queue
              </Link>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
