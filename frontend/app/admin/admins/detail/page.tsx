'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, Field, Input, StatusBadge } from '@/components/ui';
import type { AdminActivitySummary } from '@/lib/types';

function fmt(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleString() : '—';
}

const SUMMARY_ROWS: Array<{ key: keyof AdminActivitySummary; label: string }> = [
  { key: 'depositsApproved', label: 'INR deposits approved' },
  { key: 'depositsRejected', label: 'INR deposits rejected' },
  { key: 'withdrawalsApproved', label: 'INR withdrawals approved' },
  { key: 'withdrawalsRejected', label: 'INR withdrawals rejected' },
  { key: 'withdrawalsMarkedPaid', label: 'INR withdrawals marked paid' },
  { key: 'kycApproved', label: 'KYC approved' },
  { key: 'kycRejected', label: 'KYC rejected' },
  { key: 'kycRequestedInfo', label: 'KYC info requested' },
  { key: 'userFeatureChanges', label: 'User feature changes' },
  { key: 'adminSecurityActions', label: 'Admin security actions' },
  { key: 'blockedLogins', label: 'Blocked logins (TOTP/IP)' },
  { key: 'totalActions', label: 'Total recorded actions' },
];

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function AdminDetail() {
  const params = useSearchParams();
  const adminId = params.get('id') ?? '';

  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  // Applied filters (only updated on "Apply") so paging is stable.
  const [applied, setApplied] = useState<{
    action?: string;
    entityType?: string;
    userId?: string;
    from?: string;
    to?: string;
  }>({});

  const profile = useQuery({
    queryKey: ['admin-profile', adminId],
    queryFn: () => adminApi.adminProfile(adminId),
    enabled: Boolean(adminId),
  });

  const activity = useQuery({
    queryKey: ['admin-activity', adminId, applied, page],
    queryFn: () =>
      adminApi.adminActivity(adminId, {
        ...applied,
        // Convert the datetime-local inputs to ISO if present.
        from: applied.from ? new Date(applied.from).toISOString() : undefined,
        to: applied.to ? new Date(applied.to).toISOString() : undefined,
        page,
        limit: 25,
      }),
    enabled: Boolean(adminId),
  });

  if (!adminId) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <Alert>No admin id supplied.</Alert>
      </main>
    );
  }

  const p = profile.data?.data.profile;
  const summary = p?.activitySummary;
  const items = activity.data?.data.items ?? [];
  const total = activity.data?.data.total ?? 0;
  const hasMore = activity.data?.data.hasMore ?? false;

  function applyFilters() {
    setPage(1);
    setApplied({
      action: action.trim() || undefined,
      entityType: entityType.trim() || undefined,
      userId: userId.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }

  function resetFilters() {
    setAction('');
    setEntityType('');
    setUserId('');
    setFrom('');
    setTo('');
    setPage(1);
    setApplied({});
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin profile</h1>
        <Link href="/admin/admins" className="text-sm text-blue-600 underline">
          ← Back to admins
        </Link>
      </div>

      {profile.isError && (
        <div className="mb-3">
          <Alert>{errorMessage(profile.error)}</Alert>
        </div>
      )}
      {profile.isLoading && <p className="text-sm text-gray-500">Loading profile…</p>}

      {p && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Identity + status */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Identity &amp; access</h2>
            <InfoRow label="Email">
              <span className="font-mono text-xs">{p.email}</span>
            </InfoRow>
            <InfoRow label="Status">
              <StatusBadge status={p.status} />
            </InfoRow>
            <InfoRow label="Roles">{p.roles.join(', ') || '—'}</InfoRow>
            <InfoRow label="Super admin">{p.isSuperAdmin ? 'yes' : 'no'}</InfoRow>
            <InfoRow label="2FA (TOTP)">{p.totpEnabled ? 'enabled' : 'disabled'}</InfoRow>
            <InfoRow label="IP allowlist">
              {p.ipRestricted ? (
                <span className="font-mono text-xs">{p.ipAllowlist.join(', ')}</span>
              ) : (
                <span className="text-gray-400">any</span>
              )}
            </InfoRow>
            <InfoRow label="Permissions">
              <span className="text-xs text-gray-500">{p.permissions.length} granted</span>
            </InfoRow>
          </Card>

          {/* Lifecycle */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Lifecycle</h2>
            <InfoRow label="Created">{fmt(p.createdAt)}</InfoRow>
            <InfoRow label="Created by">{p.createdByEmail ?? '—'}</InfoRow>
            <InfoRow label="Last login">{fmt(p.lastLoginAt)}</InfoRow>
            <InfoRow label="Updated">{fmt(p.updatedAt)}</InfoRow>
            <InfoRow label="Deactivated at">{fmt(p.deactivatedAt)}</InfoRow>
            <InfoRow label="Deactivated by">{p.deactivatedByEmail ?? '—'}</InfoRow>
            <InfoRow label="Deactivation reason">{p.deactivationReason ?? '—'}</InfoRow>
          </Card>

          {/* Activity summary */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Activity summary</h2>
            {summary &&
              SUMMARY_ROWS.map((r) => (
                <InfoRow key={r.key} label={r.label}>
                  <span className="font-mono">{summary[r.key]}</span>
                </InfoRow>
              ))}
            <p className="mt-2 text-[11px] text-gray-400">
              Counts are derived from append-only admin logs. All historical
              activity is retained even after deactivation.
            </p>
          </Card>

          {/* Note */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Accountability</h2>
            <p className="text-sm text-gray-600">
              This profile is read-only. Deactivating an admin removes their access
              but never deletes their record or history — every approval and
              security action remains traceable here and in the audit trail for FIU
              accountability.
            </p>
          </Card>
        </div>
      )}

      {/* Activity timeline */}
      <div className="mt-6">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Activity timeline</h2>

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Field label="Action">
                <Input
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="e.g. kyc.approve"
                />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Entity type">
                <Input
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  placeholder="e.g. inr_withdrawal"
                />
              </Field>
            </div>
            <div className="w-64">
              <Field label="Affected user id">
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="uuid"
                />
              </Field>
            </div>
            <div className="w-52">
              <Field label="From">
                <Input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
            </div>
            <div className="w-52">
              <Field label="To">
                <Input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
            </div>
            <Button onClick={applyFilters}>Apply</Button>
            <Button onClick={resetFilters}>Reset</Button>
          </div>

          {activity.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {activity.isError && <Alert>{errorMessage(activity.error)}</Alert>}

          {items.length === 0 && !activity.isLoading && (
            <p className="text-sm text-gray-500">No matching activity.</p>
          )}

          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Time</th>
                  <th className="pr-2 font-medium">Action</th>
                  <th className="pr-2 font-medium">Entity</th>
                  <th className="pr-2 font-medium">User</th>
                  <th className="pr-2 font-medium">Result</th>
                  <th className="pr-2 font-medium">IP</th>
                  <th className="font-medium">Request</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b align-top last:border-0">
                    <td className="py-2 pr-2 text-gray-500 whitespace-nowrap">
                      {fmt(it.occurredAt)}
                    </td>
                    <td className="pr-2 font-mono text-xs">{it.action}</td>
                    <td className="pr-2 text-xs">
                      {it.entityType ?? '—'}
                      {it.entityId && (
                        <div className="font-mono text-[11px] text-gray-400">
                          {it.entityId.slice(0, 12)}
                        </div>
                      )}
                    </td>
                    <td className="pr-2 font-mono text-[11px]">
                      {it.affectedUserId ? it.affectedUserId.slice(0, 12) : '—'}
                    </td>
                    <td className="pr-2 text-xs">{it.result ?? '—'}</td>
                    <td className="pr-2 font-mono text-[11px]">{it.ip ?? '—'}</td>
                    <td className="font-mono text-[11px] text-gray-400">
                      {it.requestId ? it.requestId.slice(0, 8) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Page {page} · {total} total
            </span>
            <div className="flex gap-2">
              <Button
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                disabled={page <= 1 || activity.isFetching}
              >
                Prev
              </Button>
              <Button
                onClick={() => setPage((n) => n + 1)}
                disabled={!hasMore || activity.isFetching}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}

export default function AdminDetailPage() {
  const ready = useGuard('admin');
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <AdminDetail />
    </Suspense>
  );
}
