'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Card, Field, Input, Button, Alert, Select, StatusBadge } from '@/components/ui';
import type { AdminListItem } from '@/lib/types';

export default function AdminAdminsPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  // create form
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');

  const admins = useQuery({
    queryKey: ['admin-admins'],
    queryFn: () => adminApi.listAdmins(),
    enabled: ready,
  });
  const roles = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => adminApi.listRoles(),
    enabled: ready,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-admins'] });
  const onErr = (e: unknown) => setError(errorMessage(e));

  // SUPER_ADMIN may not be created via the sub-admin form.
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

  const setIps = useMutation({
    mutationFn: ({ id, ips }: { id: string; ips: string[] }) =>
      adminApi.setIpAllowlist(id, ips),
    onSuccess: invalidate,
    onError: onErr,
  });

  const assignRole = useMutation({
    mutationFn: ({ id, rid }: { id: string; rid: string }) =>
      adminApi.assignRole(id, rid),
    onSuccess: invalidate,
    onError: onErr,
  });

  const removeRole = useMutation({
    mutationFn: ({ id, rid }: { id: string; rid: string }) =>
      adminApi.removeRole(id, rid),
    onSuccess: invalidate,
    onError: onErr,
  });

  if (!ready) return null;
  const items = admins.data?.data.items ?? [];

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
    if (next === null) return; // cancelled
    const ips = next
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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

  function onRemoveRole(a: AdminListItem, name: string) {
    const rid = roleIdByName(name);
    if (!rid) return;
    if (window.confirm(`Remove role ${name} from ${a.email}?`)) {
      removeRole.mutate({ id: a.id, rid });
    }
  }

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Admin Management</h1>

        {error && <div className="mb-3"><Alert>{error}</Alert></div>}

        {createdPassword && (
          <div className="mb-4">
            <Alert>
              Sub-admin created. One-time initial password (copy now — it is not
              shown again):{' '}
              <span className="font-mono font-bold select-all">{createdPassword}</span>
              <button
                className="ml-3 text-xs underline"
                onClick={() => setCreatedPassword(null)}
              >
                dismiss
              </button>
            </Alert>
          </div>
        )}

        {/* Create sub-admin */}
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
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
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
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
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

          {roles.isError && (
            <div className="mt-3">
              <Alert>Failed to load roles. {errorMessage(roles.error)}</Alert>
            </div>
          )}
          {noAssignableRoles && (
            <div className="mt-3">
              <Alert>
                No roles found. Run RBAC setup (rbac:ensure-staging) or contact a super
                admin.
              </Alert>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Sub-admins start ACTIVE with TOTP disabled (they enroll on first login)
            and never receive SUPER_ADMIN by default.
          </p>
        </Card>

        {/* Admin list */}
        <div className="mt-6">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Admins</h2>
              <Button onClick={() => admins.refetch()}>Refresh</Button>
            </div>

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
                    <th className="pr-2 font-medium">Created</th>
                    <th className="font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-b align-top last:border-0">
                      <td className="py-2 pr-2 font-mono text-xs">{a.email}</td>
                      <td className="pr-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {a.roles.length === 0 && (
                            <span className="text-xs text-gray-400">—</span>
                          )}
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
                          {/* add a role */}
                          <select
                            className="rounded border px-1 py-0.5 text-[11px]"
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                assignRole.mutate({ id: a.id, rid: e.target.value });
                            }}
                          >
                            <option value="">+ role</option>
                            {assignableRoles
                              .filter((r) => !a.roles.includes(r.name))
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </td>
                      <td className="pr-2">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="pr-2">{a.totpEnabled ? 'on' : 'off'}</td>
                      <td className="pr-2 text-xs">
                        {a.ipRestricted ? (
                          <span className="font-mono">{a.ipAllowlist.join(', ')}</span>
                        ) : (
                          <span className="text-gray-400">any</span>
                        )}
                      </td>
                      <td className="pr-2 text-gray-500">
                        {new Date(a.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => onToggleStatus(a)}>
                            {a.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </Button>
                          <Button onClick={() => onResetTotp(a)}>Reset TOTP</Button>
                          <Button onClick={() => onEditIps(a)}>IPs</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
