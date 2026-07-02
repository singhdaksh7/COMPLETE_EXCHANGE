'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import type { AdminArchivedUserListItem, AdminUserListItem } from '@/lib/types';

const KYC = ['', 'NOT_STARTED', 'PENDING', 'IN_REVIEW', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED'];
const ACCOUNT = ['', 'ACTIVE', 'FROZEN', 'LOCKED', 'CLOSED'];
const RISK = ['', 'LOW', 'MEDIUM', 'HIGH'];

type Tab = 'active' | 'archived';

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
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('active');
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Archive / restore dialog state (SUPER_ADMIN only).
  const [archiveTarget, setArchiveTarget] = useState<AdminUserListItem | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveConfirm, setArchiveConfirm] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<AdminArchivedUserListItem | null>(null);
  const [restoreReason, setRestoreReason] = useState('');

  const me = useQuery({ queryKey: ['admin-me'], queryFn: () => adminApi.me(), enabled: ready });
  const isSuperAdmin = me.data?.data.isSuperAdmin ?? false;

  const params = {
    email: applied.email || undefined,
    kycStatus: applied.kycStatus || undefined,
    accountStatus: applied.accountStatus || undefined,
    riskLevel: applied.riskLevel || undefined,
    createdFrom: applied.createdFrom || undefined,
    createdTo: applied.createdTo || undefined,
  };

  const active = useQuery({
    queryKey: ['admin-users', applied],
    queryFn: () => adminApi.users({ limit: 50, ...params }),
    enabled: ready && tab === 'active',
  });

  const archived = useQuery({
    queryKey: ['admin-users-archived', applied],
    queryFn: () => adminApi.archivedUsers({ limit: 50, ...params }),
    enabled: ready && tab === 'archived' && isSuperAdmin,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['admin-users-archived'] });
  };

  const archiveMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.archiveUser(id, reason),
    onSuccess: () => {
      setArchiveTarget(null);
      setArchiveReason('');
      setArchiveConfirm('');
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const restoreMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.restoreUser(id, reason),
    onSuccess: () => {
      setRestoreTarget(null);
      setRestoreReason('');
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (!ready) return null;

  const activeData = active.data?.data;
  const archivedData = archived.data?.data;
  // The archive confirmation requires typing the exact email OR UID.
  const archiveConfirmed =
    !!archiveTarget &&
    (archiveConfirm.trim().toLowerCase() === archiveTarget.email.toLowerCase() ||
      archiveConfirm.trim() === archiveTarget.id) &&
    archiveReason.trim().length >= 3;

  function TabButton({ value, label }: { value: Tab; label: string }) {
    return (
      <button
        onClick={() => {
          setTab(value);
          setError(null);
        }}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          tab === value ? 'bg-brand text-black' : 'bg-panel-2 text-muted hover:text-ink'
        }`}
      >
        {label}
      </button>
    );
  }

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
            <Button
              onClick={() => (tab === 'active' ? active.refetch() : archived.refetch())}
              variant="secondary"
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Active / Deleted tabs. The Deleted tab is SUPER_ADMIN-only. */}
        <div className="mb-4 flex gap-2">
          <TabButton value="active" label="Active Users" />
          {isSuperAdmin && <TabButton value="archived" label="Deleted / Archived Users" />}
        </div>

        {error && <div className="mb-3"><Alert>{error}</Alert></div>}

        <Card>
          <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
            <Input
              placeholder="Email or UID"
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

          {tab === 'active' ? (
            <>
              {active.isLoading && <p className="text-sm text-muted">Loading users…</p>}
              {active.isError && <Alert>{errorMessage(active.error)}</Alert>}
              {activeData && (activeData.items.length === 0 ? (
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
                        <th className="font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeData.items.map((u) => (
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
                          <td className="max-w-[220px] truncate pr-3 font-mono text-xs text-muted">
                            {balancesText(u.balances)}
                          </td>
                          <td className="pr-3 text-muted">
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/users/detail?id=${u.id}`}
                                className="text-brand hover:underline"
                              >
                                View / Controls
                              </Link>
                              {isSuperAdmin && (
                                <Button
                                  variant="danger"
                                  onClick={() => {
                                    setError(null);
                                    setArchiveReason('');
                                    setArchiveConfirm('');
                                    setArchiveTarget(u);
                                  }}
                                >
                                  Archive
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          ) : (
            <>
              {archived.isLoading && <p className="text-sm text-muted">Loading archived users…</p>}
              {archived.isError && <Alert>{errorMessage(archived.error)}</Alert>}
              {archivedData && (archivedData.items.length === 0 ? (
                <EmptyState title="No archived users" hint="Archived accounts appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-muted">
                        <th className="py-2 pr-3 font-medium">User</th>
                        <th className="pr-3 font-medium">Email / Name</th>
                        <th className="pr-3 font-medium">KYC</th>
                        <th className="pr-3 font-medium">Status</th>
                        <th className="pr-3 font-medium">Balances</th>
                        <th className="pr-3 font-medium">Archived at</th>
                        <th className="pr-3 font-medium">Archived by</th>
                        <th className="pr-3 font-medium">Reason</th>
                        <th className="font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedData.items.map((u) => (
                        <tr key={u.id} className="border-b border-line last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">
                            <Link href={`/admin/users/detail?id=${u.id}&archived=1`} className="text-brand hover:underline">
                              {u.id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="pr-3">
                            <div className="font-medium text-ink">{u.email}</div>
                            <div className="text-xs text-muted">{u.fullName || '—'}</div>
                          </td>
                          <td className="pr-3"><StatusBadge status={u.kycStatus} /></td>
                          <td className="pr-3">
                            <div className="flex flex-wrap gap-1">
                              <StatusBadge status="ARCHIVED" />
                              <StatusBadge status={u.accountStatus} />
                            </div>
                          </td>
                          <td className="max-w-[200px] truncate pr-3 font-mono text-xs text-muted">
                            {balancesText(u.balances)}
                          </td>
                          <td className="pr-3 text-muted">
                            {u.deletedAt ? new Date(u.deletedAt).toLocaleString() : '—'}
                          </td>
                          <td className="pr-3 text-muted">{u.deletedByAdminEmail || '—'}</td>
                          <td className="max-w-[200px] truncate pr-3 text-muted" title={u.deletionReason ?? ''}>
                            {u.deletionReason || '—'}
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/users/detail?id=${u.id}&archived=1`}
                                className="text-brand hover:underline"
                              >
                                View
                              </Link>
                              {isSuperAdmin && (
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setError(null);
                                    setRestoreReason('');
                                    setRestoreTarget(u);
                                  }}
                                >
                                  Restore
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </Card>
      </main>

      {/* Archive confirmation modal — reason + exact email/UID required. */}
      <Modal
        open={!!archiveTarget}
        title="Archive user account"
        onClose={() => setArchiveTarget(null)}
      >
        <p className="mb-3 text-sm text-muted">
          This will remove the account from active lists and block login. History
          (financial, KYC, support, legal, audit) will be preserved for audit. Active
          sessions are revoked. This is a soft delete — the record is never destroyed.
        </p>
        <div className="space-y-3">
          <Field label="Reason (required, recorded in the audit trail)">
            <Textarea
              rows={2}
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="e.g. Verified account-closure request"
            />
          </Field>
          <Field label={`Type the user's email or UID to confirm`}>
            <Input
              value={archiveConfirm}
              onChange={(e) => setArchiveConfirm(e.target.value)}
              placeholder={archiveTarget?.email}
            />
          </Field>
          {archiveMut.isError && <Alert>{errorMessage(archiveMut.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!archiveConfirmed || archiveMut.isPending}
              onClick={() =>
                archiveTarget &&
                archiveMut.mutate({ id: archiveTarget.id, reason: archiveReason.trim() })
              }
            >
              {archiveMut.isPending ? 'Archiving…' : 'Archive account'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Restore confirmation modal. */}
      <Modal
        open={!!restoreTarget}
        title="Restore archived user"
        onClose={() => setRestoreTarget(null)}
      >
        <p className="mb-3 text-sm text-muted">
          This re-activates the account so the user can sign in again (old sessions are
          NOT restored — they must log in fresh). Blocked while a compliance hold is
          unresolved.
        </p>
        <div className="space-y-3">
          <Field label="Reason (required)">
            <Textarea
              rows={2}
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
              placeholder="e.g. Closure reversed at user request"
            />
          </Field>
          {restoreMut.isError && <Alert>{errorMessage(restoreMut.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRestoreTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={restoreReason.trim().length < 3 || restoreMut.isPending}
              onClick={() =>
                restoreTarget &&
                restoreMut.mutate({ id: restoreTarget.id, reason: restoreReason.trim() })
              }
            >
              {restoreMut.isPending ? 'Restoring…' : 'Restore account'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
