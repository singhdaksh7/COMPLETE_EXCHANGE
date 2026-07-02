'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import {
  Card,
  Field,
  Input,
  Button,
  Alert,
  Modal,
  Select,
  StatusBadge,
} from '@/components/ui';
import type { AdminListItem } from '@/lib/types';

type Tab = 'active' | 'archived';

export default function AdminAdminsPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('active');
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  // create form
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');

  // Reset-password dialog state (SUPER_ADMIN only).
  const [resetTarget, setResetTarget] = useState<AdminListItem | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me(),
    enabled: ready,
  });
  const isSuperAdmin = me.data?.data.isSuperAdmin ?? false;
  const myAdminId = me.data?.data.admin.id;

  const admins = useQuery({
    queryKey: ['admin-admins'],
    queryFn: () => adminApi.listAdmins(),
    enabled: ready,
  });
  const archivedAdmins = useQuery({
    queryKey: ['admin-admins-archived'],
    queryFn: () => adminApi.listArchivedAdmins(),
    enabled: ready && tab === 'archived' && isSuperAdmin,
  });
  const roles = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => adminApi.listRoles(),
    enabled: ready,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-admins'] });
    qc.invalidateQueries({ queryKey: ['admin-admins-archived'] });
  };
  const onErr = (e: unknown) => setError(errorMessage(e));

  const assignableRoles =
    roles.data?.data.items.filter((r) => r.name !== 'SUPER_ADMIN') ?? [];
  const rolesLoaded = roles.isSuccess;
  const noAssignableRoles = rolesLoaded && assignableRoles.length === 0;

  const create = useMutation({
    mutationFn: () => adminApi.createAdmin({ email: email.trim(), roleId }),
    onSuccess: (res) => {
      setError(null);
      setCreatedPassword(res.data.initialPassword);
      setEmail('');
      setRoleId('');
      invalidate();
    },
    onError: onErr,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      adminApi.setAdminStatus(id, status),
    onSuccess: invalidate,
    onError: onErr,
  });

  const resetTotp = useMutation({
    mutationFn: (id: string) => adminApi.resetAdminTotp(id),
    onSuccess: invalidate,
    onError: onErr,
  });

  const deactivate = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.deactivateAdmin(id, reason),
    onSuccess: invalidate,
    onError: onErr,
  });

  const reactivate = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.reactivateAdmin(id, reason),
    onSuccess: invalidate,
    onError: onErr,
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) =>
      adminApi.resetAdminPassword(id, confirm),
    onSuccess: (res) => {
      setError(null);
      setResetTarget(null);
      setResetConfirm(false);
      setTempPassword(res.data.temporaryPassword);
      invalidate();
    },
    onError: onErr,
  });

  const setIps = useMutation({
    mutationFn: ({ id, ips }: { id: string; ips: string[] }) =>
      adminApi.setIpAllowlist(id, ips),
    onSuccess: invalidate,
    onError: onErr,
  });

  const assignRole = useMutation({
    mutationFn: ({ id, rid }: { id: string; rid: string }) => adminApi.assignRole(id, rid),
    onSuccess: invalidate,
    onError: onErr,
  });

  const removeRole = useMutation({
    mutationFn: ({ id, rid }: { id: string; rid: string }) => adminApi.removeRole(id, rid),
    onSuccess: invalidate,
    onError: onErr,
  });

  if (!ready) return null;
  const items = admins.data?.data.items ?? [];
  const archivedItems = archivedAdmins.data?.data.items ?? [];

  function roleIdByName(name: string): string | undefined {
    return roles.data?.data.items.find((r) => r.name === name)?.id;
  }

  function onEditIps(a: AdminListItem) {
    setError(null);
    const current = a.ipAllowlist.join(', ');
    const next = window.prompt(
      'Allowed IPv4 addresses / CIDRs (comma-separated). Empty = no restriction.',
      current,
    );
    if (next === null) return;
    const ips = next.split(',').map((s) => s.trim()).filter(Boolean);
    setIps.mutate({ id: a.id, ips });
  }

  function onToggleStatus(a: AdminListItem) {
    setError(null);
    const next = a.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (window.confirm(`Set ${a.email} to ${next}?`)) {
      setStatus.mutate({ id: a.id, status: next });
    }
  }

  function onResetTotp(a: AdminListItem) {
    setError(null);
    if (window.confirm(`Reset TOTP for ${a.email}? They must re-enroll on next login.`)) {
      resetTotp.mutate(a.id);
    }
  }

  function onDeactivate(a: AdminListItem) {
    setError(null);
    if (a.id === myAdminId) {
      setError('You cannot archive your own admin account.');
      return;
    }
    const reason = window.prompt(
      `Archive (deactivate) ${a.email}?\n\nThis REMOVES their access and kills live ` +
        `sessions, but PRESERVES all audit logs and historical activity. Enter a ` +
        `reason (required, recorded in the audit trail):`,
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('A reason of at least 3 characters is required to archive an admin.');
      return;
    }
    deactivate.mutate({ id: a.id, reason: reason.trim() });
  }

  function onReactivate(a: AdminListItem) {
    setError(null);
    const reason = window.prompt(
      `Reactivate ${a.email}? This re-enables login (old sessions are NOT restored). ` +
        `Enter a reason (required):`,
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('A reason of at least 3 characters is required to reactivate an admin.');
      return;
    }
    reactivate.mutate({ id: a.id, reason: reason.trim() });
  }

  function onRemoveRole(a: AdminListItem, name: string) {
    const rid = roleIdByName(name);
    if (!rid) return;
    if (window.confirm(`Remove role ${name} from ${a.email}?`)) {
      removeRole.mutate({ id: a.id, rid });
    }
  }

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
        <h1 className="mb-4 text-xl font-semibold">Admin Management</h1>

        {error && <div className="mb-3"><Alert>{error}</Alert></div>}

        {createdPassword && (
          <div className="mb-4">
            <Alert>
              Sub-admin created. One-time initial password (copy now — it is not shown
              again):{' '}
              <span className="font-mono font-bold select-all">{createdPassword}</span>
              <button className="ml-3 text-xs underline" onClick={() => setCreatedPassword(null)}>
                dismiss
              </button>
            </Alert>
          </div>
        )}

        {tempPassword && (
          <div className="mb-4">
            <Alert>
              Password reset. One-time temporary password —{' '}
              <strong>save this now. It will not be shown again.</strong> The admin must
              change it on next login:{' '}
              <span className="font-mono font-bold select-all">{tempPassword}</span>
              <button className="ml-3 text-xs underline" onClick={() => setTempPassword(null)}>
                dismiss
              </button>
            </Alert>
          </div>
        )}

        <div className="mb-4 flex gap-2">
          <TabButton value="active" label="Active Admins" />
          {isSuperAdmin && <TabButton value="archived" label="Deleted / Archived Admins" />}
        </div>

        {/* Create sub-admin — active tab only */}
        {tab === 'active' && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Create sub-admin</h2>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim() && roleId) create.mutate();
              }}
            >
              <div className="min-w-[220px] flex-1">
                <Field label="Email">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </Field>
              </div>
              <div className="w-56">
                <Field label="Role">
                  <Select
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    required
                    disabled={roles.isLoading || roles.isError || noAssignableRoles}
                  >
                    <option value="">
                      {roles.isLoading
                        ? 'Loading roles…'
                        : roles.isError
                          ? 'Failed to load roles'
                          : noAssignableRoles
                            ? 'No roles available'
                            : 'Select role…'}
                    </option>
                    {assignableRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button
                type="submit"
                disabled={create.isPending || !email.trim() || !roleId || noAssignableRoles}
              >
                {create.isPending ? 'Creating…' : 'Create'}
              </Button>
            </form>
            <p className="mt-2 text-xs text-gray-500">
              Sub-admins start ACTIVE with TOTP disabled (they enroll on first login) and
              never receive SUPER_ADMIN by default.
            </p>
          </Card>
        )}

        {/* List */}
        <div className="mt-6">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {tab === 'active' ? 'Active admins' : 'Archived admins'}
              </h2>
              <Button onClick={() => (tab === 'active' ? admins.refetch() : archivedAdmins.refetch())}>
                Refresh
              </Button>
            </div>

            <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Archiving an admin removes access and kills live sessions, but is a{' '}
              <strong>soft delete</strong>: the record and all historical activity are
              retained forever for accountability. Admin records are never hard-deleted.
              {!isSuperAdmin && ' Only a super admin can archive, reactivate, or reset admin passwords.'}
            </p>

            {tab === 'active' ? (
              <>
                {admins.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                {admins.isError && <Alert>{errorMessage(admins.error)}</Alert>}
                {items.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-2 font-medium">Email</th>
                        <th className="pr-2 font-medium">Roles</th>
                        <th className="pr-2 font-medium">Status</th>
                        <th className="pr-2 font-medium">TOTP</th>
                        <th className="pr-2 font-medium">IP allowlist</th>
                        <th className="font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((a) => (
                        <tr key={a.id} className="border-b align-top last:border-0">
                          <td className="py-2 pr-2 font-mono text-xs">
                            {a.email}
                            {a.mustChangePassword && (
                              <div className="mt-1"><StatusBadge status="PWD RESET PENDING" /></div>
                            )}
                          </td>
                          <td className="pr-2">
                            <div className="flex flex-wrap items-center gap-1">
                              {a.roles.length === 0 && <span className="text-xs text-gray-400">—</span>}
                              {a.roles.map((r) => (
                                <span
                                  key={r}
                                  className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px]"
                                >
                                  {r}
                                  {r !== 'SUPER_ADMIN' && (
                                    <button
                                      title="Remove role"
                                      className="text-gray-400 hover:text-red-500"
                                      onClick={() => onRemoveRole(a, r)}
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                              <select
                                className="rounded border px-1 py-0.5 text-[11px]"
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) assignRole.mutate({ id: a.id, rid: e.target.value });
                                }}
                              >
                                <option value="">+ role</option>
                                {assignableRoles
                                  .filter((r) => !a.roles.includes(r.name))
                                  .map((r) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                              </select>
                            </div>
                          </td>
                          <td className="pr-2"><StatusBadge status={a.status} /></td>
                          <td className="pr-2">{a.totpEnabled ? 'on' : 'off'}</td>
                          <td className="pr-2 text-xs">
                            {a.ipRestricted ? (
                              <span className="font-mono">{a.ipAllowlist.join(', ')}</span>
                            ) : (
                              <span className="text-gray-400">any</span>
                            )}
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/admins/detail?id=${a.id}`}
                                className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
                              >
                                Profile
                              </Link>
                              <Button onClick={() => onToggleStatus(a)}>
                                {a.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                              </Button>
                              <Button onClick={() => onResetTotp(a)}>Reset TOTP</Button>
                              <Button onClick={() => onEditIps(a)}>IPs</Button>
                              {isSuperAdmin && a.id !== myAdminId && (
                                <Button
                                  onClick={() => {
                                    setError(null);
                                    setResetConfirm(false);
                                    setResetTarget(a);
                                  }}
                                >
                                  Reset Password
                                </Button>
                              )}
                              {isSuperAdmin && a.id !== myAdminId && (
                                <Button variant="danger" onClick={() => onDeactivate(a)}>Archive</Button>
                              )}
                              {a.id === myAdminId && (
                                <span className="self-center text-[11px] text-gray-400" title="You cannot archive your own account">
                                  (you)
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <>
                {archivedAdmins.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                {archivedAdmins.isError && <Alert>{errorMessage(archivedAdmins.error)}</Alert>}
                {archivedItems.length === 0 && !archivedAdmins.isLoading ? (
                  <p className="text-sm text-gray-500">No archived admins.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-2 font-medium">Email</th>
                        <th className="pr-2 font-medium">Roles</th>
                        <th className="pr-2 font-medium">Status</th>
                        <th className="pr-2 font-medium">Archived at</th>
                        <th className="pr-2 font-medium">Reason</th>
                        <th className="font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedItems.map((a) => (
                        <tr key={a.id} className="border-b align-top last:border-0">
                          <td className="py-2 pr-2 font-mono text-xs">{a.email}</td>
                          <td className="pr-2">
                            <div className="flex flex-wrap gap-1">
                              {a.roles.length === 0 && <span className="text-xs text-gray-400">—</span>}
                              {a.roles.map((r) => (
                                <span key={r} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px]">{r}</span>
                              ))}
                            </div>
                          </td>
                          <td className="pr-2"><StatusBadge status="ARCHIVED" /></td>
                          <td className="pr-2 text-gray-500">
                            {a.deactivatedAt ? new Date(a.deactivatedAt).toLocaleString() : '—'}
                          </td>
                          <td className="max-w-[220px] truncate pr-2 text-gray-500" title={a.deactivationReason ?? ''}>
                            {a.deactivationReason || '—'}
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/admins/detail?id=${a.id}`}
                                className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
                              >
                                Profile
                              </Link>
                              {isSuperAdmin && (
                                <Button onClick={() => onReactivate(a)}>Reactivate</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </Card>
        </div>
      </main>

      {/* Reset-password confirmation modal (SUPER_ADMIN). */}
      <Modal
        open={!!resetTarget}
        title="Reset admin password"
        onClose={() => setResetTarget(null)}
      >
        <p className="mb-3 text-sm text-muted">
          This will revoke <strong>{resetTarget?.email}</strong>&apos;s current sessions and
          require them to set a new password before using the console. A one-time
          temporary password is generated and shown once — the old password is never
          recovered or displayed.
        </p>
        <label className="mb-3 flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Confirm even if this is the last active SUPER_ADMIN (required only in that
            case; safe to leave unchecked otherwise).
          </span>
        </label>
        {resetPassword.isError && <Alert>{errorMessage(resetPassword.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={resetPassword.isPending}
            onClick={() =>
              resetTarget && resetPassword.mutate({ id: resetTarget.id, confirm: resetConfirm })
            }
          >
            {resetPassword.isPending ? 'Resetting…' : 'Reset password'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
