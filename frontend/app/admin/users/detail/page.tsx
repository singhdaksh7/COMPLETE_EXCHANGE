'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, EmptyState, Row, Select, StatusBadge } from '@/components/ui';

function ShortId({ id }: { id: string }) {
  return <span className="font-mono text-xs">{id.slice(0, 8)}</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </Card>
  );
}

function AdminUserDetailInner() {
  const ready = useGuard('admin');
  const search = useSearchParams();
  const userId = search.get('id') ?? '';
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [riskNote, setRiskNote] = useState('');

  const q = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => adminApi.userDetail(userId),
    enabled: ready && !!userId,
  });

  const me = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me(),
    enabled: ready,
  });
  const permissions = me.data?.data.permissions ?? [];
  const roles = me.data?.data.roles ?? [];
  const canManageUsers = roles.includes('SUPER_ADMIN') || permissions.includes('users.manage');
  const canManageRisk = roles.includes('SUPER_ADMIN') || permissions.includes('risk.manage');

  useEffect(() => {
    const user = q.data?.data;
    if (!user) return;
    setRiskLevel(user.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH');
    setRiskNote(user.riskNote ?? '');
  }, [q.data?.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-user', userId] });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
  };
  const onErr = (e: unknown) => setActionError(errorMessage(e));

  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'FROZEN') => adminApi.setUserStatus(userId, status),
    onSuccess: () => {
      setActionError(null);
      refresh();
    },
    onError: onErr,
  });
  const setWithdrawalBlock = useMutation({
    mutationFn: (blocked: boolean) => adminApi.setUserWithdrawalBlock(userId, blocked),
    onSuccess: () => {
      setActionError(null);
      refresh();
    },
    onError: onErr,
  });
  const saveRisk = useMutation({
    mutationFn: () => adminApi.updateUserRisk(userId, { riskLevel, riskNote: riskNote.trim() || null }),
    onSuccess: () => {
      setActionError(null);
      refresh();
    },
    onError: onErr,
  });

  if (!ready) return null;
  const user = q.data?.data;
  const busy = setStatus.isPending || setWithdrawalBlock.isPending || saveRisk.isPending;

  function confirmStatus(status: 'ACTIVE' | 'FROZEN') {
    const verb = status === 'FROZEN' ? 'Freeze' : 'Unfreeze';
    if (window.confirm(`${verb} this user account?`)) setStatus.mutate(status);
  }

  function confirmWithdrawalBlock(blocked: boolean) {
    const verb = blocked ? 'Block withdrawals for' : 'Unblock withdrawals for';
    if (window.confirm(`${verb} this user?`)) setWithdrawalBlock.mutate(blocked);
  }

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <Link href="/admin/users" className="mb-2 block text-xs text-brand hover:underline">
              Back to users
            </Link>
            <h1 className="text-xl font-semibold text-ink">User Detail</h1>
            {user && <p className="mt-0.5 text-sm text-muted">{user.email}</p>}
          </div>
          <Button onClick={() => q.refetch()} variant="secondary" disabled={!userId}>Refresh</Button>
        </div>

        {!userId && <Alert>User ID is required.</Alert>}
        {actionError && <div className="mb-4"><Alert>{actionError}</Alert></div>}
        {q.isLoading && <p className="text-sm text-muted">Loading user…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {user && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Section title="Profile">
                <Row label="User ID" value={<span className="font-mono text-xs">{user.id}</span>} />
                <Row label="Email" value={user.email} />
                <Row label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} />
                <Row label="Phone" value={user.phone ?? '—'} />
                <Row label="TOTP enabled" value={user.totpEnabled ? 'Yes' : 'No'} />
                <Row label="Created" value={new Date(user.createdAt).toLocaleString()} />
                <Row label="Last login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'} />
              </Section>

              <Section title="KYC">
                <Row label="Status" value={<StatusBadge status={user.kycStatus} />} />
                <Row label="Tier" value={user.kycTier} />
                <Row label="Full name" value={user.kycProfile?.fullName ?? '—'} />
                <Row label="Provider" value={user.kycProfile?.provider ?? '—'} />
                <Row label="Provider risk score" value={user.kycProfile?.riskScore ?? '—'} />
                <Row label="PAN" value={user.kycProfile?.panMasked ?? '—'} />
                <Row label="Aadhaar" value={user.kycProfile?.aadhaarMasked ?? '—'} />
              </Section>

              <Section title="Balances">
                {user.balances.length === 0 ? (
                  <EmptyState title="No balances found" />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-muted">
                        <th className="py-2 font-medium">Asset</th>
                        <th className="font-medium">Available</th>
                        <th className="font-medium">Locked</th>
                        <th className="font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.balances.map((b) => (
                        <tr key={b.asset} className="border-b border-line last:border-0">
                          <td className="py-2 font-mono">{b.asset}</td>
                          <td className="font-mono">{b.available}</td>
                          <td className="font-mono">{b.locked}</td>
                          <td className="font-mono">{b.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section title="Recent INR Deposits / Withdrawals">
                {user.inrTransactions.length === 0 ? (
                  <EmptyState title="No INR transactions" />
                ) : (
                  <div className="space-y-2">
                    {user.inrTransactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between border-b border-line pb-2 text-sm last:border-0">
                        <span><ShortId id={t.id} /> {t.type}</span>
                        <span className="font-mono">₹{t.amount}</span>
                        <StatusBadge status={t.status} />
                        <span className="text-muted">{new Date(t.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Recent Crypto Withdrawals">
                {user.withdrawals.length === 0 ? (
                  <EmptyState title="No withdrawals" />
                ) : (
                  <div className="space-y-2">
                    {user.withdrawals.map((w) => (
                      <div key={w.id} className="flex items-center justify-between border-b border-line pb-2 text-sm last:border-0">
                        <span><ShortId id={w.id} /> {w.asset}</span>
                        <span className="font-mono">{w.amount}</span>
                        <StatusBadge status={w.status} />
                        <span className="text-muted">{new Date(w.requestedAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Recent Orders / Trades">
                {user.orders.length === 0 && user.trades.length === 0 ? (
                  <EmptyState title="No orders or trades" />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted">Orders</div>
                      {user.orders.map((o) => (
                        <div key={o.id} className="border-b border-line pb-2 text-sm last:border-0">
                          <div className="flex justify-between">
                            <span><ShortId id={o.id} /> {o.marketSymbol}</span>
                            <StatusBadge status={o.status} />
                          </div>
                          <div className="text-xs text-muted">{o.side} {o.type} · {new Date(o.createdAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted">Trades</div>
                      {user.trades.map((t) => (
                        <div key={`${t.id}-${t.seq}`} className="border-b border-line pb-2 text-sm last:border-0">
                          <div className="flex justify-between">
                            <span><ShortId id={t.id} /> {t.marketSymbol}</span>
                            <span className="font-mono">{t.price}</span>
                          </div>
                          <div className="text-xs text-muted">{t.quantity} · {new Date(t.executedAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            </div>

            <div className="space-y-4">
              <Section title="Risk Controls">
                <div className="mb-3 flex flex-wrap gap-2">
                  <StatusBadge status={user.accountStatus} />
                  {user.withdrawalsBlocked && <StatusBadge status="WITHDRAWALS BLOCKED" />}
                  <StatusBadge status={`${user.riskLevel} RISK`} />
                </div>
                <div className="space-y-2">
                  {user.accountStatus === 'FROZEN' ? (
                    <Button variant="success" disabled={busy || !canManageUsers} onClick={() => confirmStatus('ACTIVE')} className="w-full">
                      Unfreeze user
                    </Button>
                  ) : (
                    <Button variant="danger" disabled={busy || !canManageUsers} onClick={() => confirmStatus('FROZEN')} className="w-full">
                      Freeze user
                    </Button>
                  )}
                  {user.withdrawalsBlocked ? (
                    <Button variant="success" disabled={busy || !canManageRisk} onClick={() => confirmWithdrawalBlock(false)} className="w-full">
                      Unblock withdrawals
                    </Button>
                  ) : (
                    <Button variant="danger" disabled={busy || !canManageRisk} onClick={() => confirmWithdrawalBlock(true)} className="w-full">
                      Block withdrawals
                    </Button>
                  )}
                </div>
                {!canManageUsers && !canManageRisk && (
                  <p className="mt-3 text-xs text-muted">
                    Your admin role can view users but cannot perform risk actions.
                  </p>
                )}
              </Section>

              <Section title="Risk Note">
                <div className="space-y-2">
                  <Select value={riskLevel} disabled={!canManageRisk} onChange={(e) => setRiskLevel(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}>
                    <option value="LOW">LOW RISK</option>
                    <option value="MEDIUM">MEDIUM RISK</option>
                    <option value="HIGH">HIGH RISK</option>
                  </Select>
                  <textarea
                    value={riskNote}
                    disabled={!canManageRisk}
                    onChange={(e) => setRiskNote(e.target.value)}
                    rows={8}
                    className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-brand focus:outline-none"
                    placeholder="Admin risk note"
                  />
                  <Button disabled={busy || !canManageRisk} onClick={() => saveRisk.mutate()} className="w-full">
                    Save risk note
                  </Button>
                </div>
              </Section>

              <Section title="Recent Admin Actions">
                {user.adminLogs.length === 0 ? (
                  <EmptyState title="No admin actions" />
                ) : (
                  <div className="space-y-2">
                    {user.adminLogs.map((l) => (
                      <div key={l.id} className="border-b border-line pb-2 text-xs last:border-0">
                        <div className="font-mono text-ink">{l.action}</div>
                        <div className="text-muted">{new Date(l.occurredAt).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Recent User Activity">
                {user.auditLogs.length === 0 ? (
                  <EmptyState title="No recent activity" />
                ) : (
                  <div className="space-y-2">
                    {user.auditLogs.map((l) => (
                      <div key={l.id} className="border-b border-line pb-2 text-xs last:border-0">
                        <div className="font-mono text-ink">{l.action}</div>
                        <div className="text-muted">{new Date(l.occurredAt).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function AdminUserDetailPage() {
  return (
    <Suspense fallback={null}>
      <AdminUserDetailInner />
    </Suspense>
  );
}
