'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Alert, Row, StatusBadge } from '@/components/ui';

export default function DashboardPage() {
  const ready = useGuard('user');
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    enabled: ready,
  });

  if (!ready) return null;
  const me = q.data?.data;

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-xl px-4">
        <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>

        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {me && (
          <Card>
            <Row label="Email" value={me.user.email} />
            <Row label="Account status" value={me.user.status} />
            <Row
              label="KYC status"
              value={<StatusBadge status={me.user.kycStatus} />}
            />
            <Row label="KYC tier" value={String(me.user.kycTier)} />
            <Row label="Roles" value={me.roles.join(', ') || '—'} />
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Link href="/wallet" className="underline">
                Wallet
              </Link>
              <Link href="/deposit" className="underline">
                Deposit INR
              </Link>
              <Link href="/convert" className="underline">
                Convert
              </Link>
              <Link href="/withdraw" className="underline">
                Withdraw USDT
              </Link>
              <Link href="/kyc/submit" className="underline">
                Submit KYC
              </Link>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
