'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';

const KYC = ['', 'NOT_STARTED', 'PENDING', 'IN_REVIEW', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED'];
const ACCOUNT = ['', 'ACTIVE', 'FROZEN', 'LOCKED', 'CLOSED'];
const RISK = ['', 'LOW', 'MEDIUM', 'HIGH'];

interface Filters {
  email: string;
  kycStatus: string;
  accountStatus: string;
  riskLevel: string;
  createdFrom: string;
  createdTo: string;
}

const EMPTY: Filters = {
  email: '',
  kycStatus: '',
  accountStatus: '',
  riskLevel: '',
  createdFrom: '',
  createdTo: '',
};

function balancesText(balances: Array<{ asset: string; total: string }>) {
  if (balances.length === 0) return '—';
  return balances.map((b) => `${b.asset} ${b.total}`).join(' · ');
}

export default function AdminUsersPage() {
  const ready = useGuard('admin');
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);

  const params = {
    email: applied.email || undefined,
    kycStatus: applied.kycStatus || undefined,
    accountStatus: applied.accountStatus || undefined,
    riskLevel: applied.riskLevel || undefined,
    createdFrom: applied.createdFrom || undefined,
    createdTo: applied.createdTo || undefined,
  };

  const q = useQuery({
    queryKey: ['admin-users', applied],
    queryFn: () => adminApi.users({ limit: 50, ...params }),
    enabled: ready,
  });

  if (!ready) return null;
  const data = q.data?.data;

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink">Users</h1>
            <p className="mt-0.5 text-sm text-muted">
              Search accounts, inspect KYC and risk status, and open user-level controls.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button onClick={() => q.refetch()} variant="secondary">Refresh</Button>
          </div>
        </div>

        <Card>
          <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
            <Input
              placeholder="Email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <Select
              value={draft.kycStatus}
              onChange={(e) => setDraft({ ...draft, kycStatus: e.target.value })}
            >
              {KYC.map((s) => <option key={s} value={s}>{s || 'All KYC'}</option>)}
            </Select>
            <Select
              value={draft.accountStatus}
              onChange={(e) => setDraft({ ...draft, accountStatus: e.target.value })}
            >
              {ACCOUNT.map((s) => <option key={s} value={s}>{s || 'All accounts'}</option>)}
            </Select>
            <Select
              value={draft.riskLevel}
              onChange={(e) => setDraft({ ...draft, riskLevel: e.target.value })}
            >
              {RISK.map((s) => <option key={s} value={s}>{s || 'All risk'}</option>)}
            </Select>
            <Input
              type="date"
              value={draft.createdFrom}
              onChange={(e) => setDraft({ ...draft, createdFrom: e.target.value })}
            />
            <Input
              type="date"
              value={draft.createdTo}
              onChange={(e) => setDraft({ ...draft, createdTo: e.target.value })}
            />
          </div>
          <div className="mb-4 flex gap-2">
            <Button onClick={() => setApplied(draft)}>Apply</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
              }}
            >
              Reset
            </Button>
          </div>

          {q.isLoading && <p className="text-sm text-muted">Loading users…</p>}
          {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

          {data && (data.items.length === 0 ? (
            <EmptyState title="No users found" hint="Adjust the filters and search again." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-2 pr-3 font-medium">User</th>
                    <th className="pr-3 font-medium">Email</th>
                    <th className="pr-3 font-medium">KYC</th>
                    <th className="pr-3 font-medium">Account</th>
                    <th className="pr-3 font-medium">Risk</th>
                    <th className="pr-3 font-medium">Balances</th>
                    <th className="pr-3 font-medium">Last login</th>
                    <th className="pr-3 font-medium">Created</th>
                    <th className="font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">
                        <Link href={`/admin/users/detail?id=${u.id}`} className="text-brand hover:underline">
                          {u.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="pr-3">
                        <div className="font-medium text-ink">{u.email}</div>
                        <div className="text-xs text-muted">
                          {u.emailVerified ? 'Verified' : 'Unverified'}
                        </div>
                      </td>
                      <td className="pr-3"><StatusBadge status={u.kycStatus} /></td>
                      <td className="pr-3">
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge status={u.accountStatus} />
                          {u.withdrawalsBlocked && <StatusBadge status="WITHDRAWALS BLOCKED" />}
                        </div>
                      </td>
                      <td className="pr-3"><StatusBadge status={`${u.riskLevel} RISK`} /></td>
                      <td className="max-w-[260px] truncate pr-3 font-mono text-xs text-muted">
                        {balancesText(u.balances)}
                      </td>
                      <td className="pr-3 text-muted">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                      </td>
                      <td className="pr-3 text-muted">{new Date(u.createdAt).toLocaleString()}</td>
                      <td>
                        <Link
                          href={`/admin/users/detail?id=${u.id}`}
                          className="text-brand hover:underline"
                        >
                          View / Controls
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Card>
      </main>
    </>
  );
}
