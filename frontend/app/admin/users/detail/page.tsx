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
import type { ProfileComplianceNote, ProfilePage, ProfileSection, TimelineEvent } from '@/lib/types';
import { FeatureControls } from './FeatureControls';

const TIMELINE_CAT_CLS: Record<string, string> = {
  ACCOUNT: 'bg-sky-500/15 text-sky-300',
  AUTH: 'bg-indigo-500/15 text-indigo-300',
  KYC: 'bg-brand/15 text-brand',
  CONTROLS: 'bg-purple-500/15 text-purple-300',
  DEPOSIT: 'bg-up/15 text-up',
  WITHDRAWAL: 'bg-amber-500/15 text-amber-300',
  TRADING: 'bg-cyan-500/15 text-cyan-300',
  COMPLIANCE: 'bg-down/15 text-down',
  ADMIN_ACTION: 'bg-panel-2 text-muted',
};

const TABS = [
  'Overview',
  'Timeline',
  'Controls',
  'Balances',
  'INR',
  'Crypto',
  'Orders & Trades',
  'Sessions',
  'Risk & Compliance',
  'Audit Trail',
] as const;
type Tab = (typeof TABS)[number];

function fmt(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleString() : '—';
}
function ShortId({ id }: { id: string }) {
  return <span className="font-mono text-xs">{id.slice(0, 8)}</span>;
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/**
 * Holds the aggregate's first page plus any further pages fetched on demand.
 * Resets whenever the embedded first page changes (e.g. a different user or a
 * refetch), so the "Load more" cursor never drifts across users.
 */
function useSectionPager<T>(
  userId: string,
  section: ProfileSection,
  firstPage: ProfilePage<T> | undefined,
) {
  const [extra, setExtra] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExtra([]);
    setCursor(firstPage?.nextCursor ?? null);
    setError(null);
  }, [firstPage]);

  const items = [...(firstPage?.items ?? []), ...extra];

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.userProfileSection<T>(userId, section, { cursor });
      setExtra((p) => [...p, ...res.data.items]);
      setCursor(res.data.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return { items, hasMore: !!cursor, loading, error, loadMore };
}

function LoadMore({
  hasMore,
  loading,
  error,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onClick: () => void;
}) {
  if (!hasMore && !error) return null;
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      {error && <Alert>{error}</Alert>}
      {hasMore && (
        <Button variant="secondary" onClick={onClick} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="py-2 pr-3 font-medium">{children}</th>;
}
function Td({ children }: { children: ReactNode }) {
  return <td className="py-2 pr-3 align-top">{children}</td>;
}
function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-muted">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Per-user compliance notes (Stage 5D). Append-only: notes can be created (when
 * the admin holds compliance.case.manage) but never edited or deleted. The list
 * seeds from the aggregate's embedded first page and supports cursor "Load
 * more"; creating a note refetches the profile so the new note appears.
 */
function ComplianceNotes({
  userId,
  firstPage,
  canManage,
}: {
  userId: string;
  firstPage: ProfilePage<ProfileComplianceNote> | null;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [extra, setExtra] = useState<ProfileComplianceNote[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [body, setBody] = useState('');

  useEffect(() => {
    setExtra([]);
    setCursor(firstPage?.nextCursor ?? null);
    setLoadErr(null);
  }, [firstPage]);

  const notes = [...(firstPage?.items ?? []), ...extra];

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await adminApi.userComplianceNotes(userId, { cursor });
      setExtra((p) => [...p, ...res.data.items]);
      setCursor(res.data.nextCursor);
    } catch (e) {
      setLoadErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const add = useMutation({
    mutationFn: () => adminApi.addUserComplianceNote(userId, body.trim()),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['admin-user-profile', userId] });
    },
  });

  return (
    <Section title="Compliance Notes">
      {canManage && (
        <div className="mb-4 space-y-2">
          <textarea
            value={body}
            disabled={add.isPending}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add a compliance note (visible to admins; cannot be edited or deleted)"
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-brand focus:outline-none"
          />
          {add.isError && <Alert>{errorMessage(add.error)}</Alert>}
          <Button onClick={() => add.mutate()} disabled={add.isPending || body.trim().length === 0}>
            {add.isPending ? 'Saving…' : 'Add note'}
          </Button>
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState title="No compliance notes" />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="border-b border-line pb-3 text-sm last:border-0">
              <p className="whitespace-pre-wrap text-ink">{n.body}</p>
              <div className="mt-1 text-xs text-muted-2">
                {n.adminId ? <>by <ShortId id={n.adminId} /> · </> : null}
                {fmt(n.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
      <LoadMore hasMore={!!cursor} loading={loading} error={loadErr} onClick={loadMore} />
    </Section>
  );
}

/**
 * Stage 8D unified user timeline. Merges signup, auth/session, KYC, control
 * changes, deposits, withdrawals, orders, trades, compliance cases/notes and
 * admin actions into one time-ordered feed. Cursor-paginated (cursor = the last
 * event's timestamp). Compliance events appear only when the caller has
 * compliance.view (enforced server-side).
 */
function UserTimeline({ userId }: { userId: string }) {
  const [extra, setExtra] = useState<TimelineEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['user-timeline', userId],
    queryFn: () => adminApi.userTimeline(userId),
    enabled: !!userId,
    retry: false,
  });

  useEffect(() => {
    setExtra([]);
    setCursor(q.data?.data.nextCursor ?? null);
    setLoadErr(null);
  }, [q.data]);

  const items = [...(q.data?.data.items ?? []), ...extra];

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await adminApi.userTimeline(userId, { cursor });
      setExtra((p) => [...p, ...res.data.items]);
      setCursor(res.data.nextCursor);
    } catch (e) {
      setLoadErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Timeline">
      {q.isLoading && <p className="text-sm text-muted">Loading timeline…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}
      {q.data && items.length === 0 && <EmptyState title="No timeline events" />}
      {items.length > 0 && (
        <ol className="relative space-y-3 border-l border-line pl-4">
          {items.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand" />
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TIMELINE_CAT_CLS[e.category] ?? 'bg-panel-2 text-muted'}`}>
                  {e.category}
                </span>
                <span className="text-sm text-ink">{e.title}</span>
                {e.detail && <span className="text-xs text-muted">· {e.detail}</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-2">{fmt(e.occurredAt)}</div>
            </li>
          ))}
        </ol>
      )}
      <LoadMore hasMore={!!cursor} loading={loading} error={loadErr} onClick={loadMore} />
    </Section>
  );
}

function AdminUserDetailInner() {
  const ready = useGuard('admin');
  const search = useSearchParams();
  const userId = search.get('id') ?? '';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Overview');
  const [actionError, setActionError] = useState<string | null>(null);
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [riskNote, setRiskNote] = useState('');

  const q = useQuery({
    queryKey: ['admin-user-profile', userId],
    queryFn: () => adminApi.userProfile(userId),
    enabled: ready && !!userId,
  });

  const me = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me(),
    enabled: ready,
  });
  const permissions = me.data?.data.permissions ?? [];
  const roles = me.data?.data.roles ?? [];
  const isSuper = roles.includes('SUPER_ADMIN');
  const has = (p: string) => isSuper || permissions.includes(p);
  const canManageUsers = has('users.manage');
  const canManageRisk = has('risk.manage');
  const canViewControls = has('users.controls.view');
  const canUpdateControls = has('users.controls.update');

  const profile = q.data?.data;

  useEffect(() => {
    if (!profile) return;
    setRiskLevel(profile.identity.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH');
    setRiskNote(profile.identity.riskNote ?? '');
  }, [profile]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-user-profile', userId] });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
  };
  const onErr = (e: unknown) => setActionError(errorMessage(e));

  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'FROZEN') => adminApi.setUserStatus(userId, status),
    onSuccess: () => { setActionError(null); refresh(); },
    onError: onErr,
  });
  const setWithdrawalBlock = useMutation({
    mutationFn: (blocked: boolean) => adminApi.setUserWithdrawalBlock(userId, blocked),
    onSuccess: () => { setActionError(null); refresh(); },
    onError: onErr,
  });
  const saveRisk = useMutation({
    mutationFn: () => adminApi.updateUserRisk(userId, { riskLevel, riskNote: riskNote.trim() || null }),
    onSuccess: () => { setActionError(null); refresh(); },
    onError: onErr,
  });
  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => adminApi.revokeUserSession(userId, sessionId),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['admin-user-profile', userId] });
    },
    onError: onErr,
  });

  // Section pagers (seeded from the aggregate's embedded first page).
  const inrDeposits = useSectionPager(userId, 'inrDeposits', profile?.inrDeposits);
  const inrWithdrawals = useSectionPager(userId, 'inrWithdrawals', profile?.inrWithdrawals);
  const cryptoDeposits = useSectionPager(userId, 'cryptoDeposits', profile?.cryptoDeposits);
  const cryptoWithdrawals = useSectionPager(userId, 'cryptoWithdrawals', profile?.cryptoWithdrawals);
  const orders = useSectionPager(userId, 'orders', profile?.orders);
  const trades = useSectionPager(userId, 'trades', profile?.trades);
  const sessions = useSectionPager(userId, 'sessions', profile?.sessions);
  const audit = useSectionPager(userId, 'auditTrail', profile?.auditTrail);

  if (!ready) return null;
  const busy = setStatus.isPending || setWithdrawalBlock.isPending || saveRisk.isPending;

  function confirmStatus(status: 'ACTIVE' | 'FROZEN') {
    const verb = status === 'FROZEN' ? 'Freeze' : 'Unfreeze';
    if (window.confirm(`${verb} this user account?`)) setStatus.mutate(status);
  }
  function confirmWithdrawalBlock(blocked: boolean) {
    const verb = blocked ? 'Block withdrawals for' : 'Unblock withdrawals for';
    if (window.confirm(`${verb} this user?`)) setWithdrawalBlock.mutate(blocked);
  }

  const id = profile?.identity;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <Link href="/admin/users" className="mb-2 block text-xs text-brand hover:underline">
            Back to users
          </Link>
          <h1 className="text-xl font-semibold text-ink">User Profile</h1>
          {id && <p className="mt-0.5 text-sm text-muted">{id.email}</p>}
        </div>
        <Button onClick={() => q.refetch()} variant="secondary" disabled={!userId}>Refresh</Button>
      </div>

      {!userId && <Alert>User ID is required.</Alert>}
      {actionError && <div className="mb-4"><Alert>{actionError}</Alert></div>}
      {q.isLoading && <p className="text-sm text-muted">Loading profile…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {profile && id && (
        <>
          {/* Header summary + tab bar */}
          <div className="mb-4 flex flex-wrap gap-2">
            <StatusBadge status={id.accountStatus} />
            <StatusBadge status={id.kycStatus} />
            <StatusBadge status={`${id.riskLevel} RISK`} />
            {id.withdrawalsBlocked && <StatusBadge status="WITHDRAWALS BLOCKED" />}
          </div>

          <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
            {TABS.map((t) => {
              if (t === 'Controls' && !canViewControls) return null;
              if (t === 'Risk & Compliance' && !profile.meta.complianceVisible) return null;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                    tab === t
                      ? 'border-brand text-ink'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {tab === 'Overview' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Section title="Identity">
                  <Row label="User ID" value={<span className="font-mono text-xs">{id.id}</span>} />
                  <Row label="Email" value={id.email} />
                  <Row label="Email verified" value={id.emailVerified ? `Yes · ${fmt(id.emailVerifiedAt)}` : 'No'} />
                  <Row label="Phone" value={id.phone ?? '—'} />
                  <Row label="Account status" value={<StatusBadge status={id.accountStatus} />} />
                  <Row label="KYC status" value={<StatusBadge status={id.kycStatus} />} />
                  <Row label="Risk level" value={<StatusBadge status={`${id.riskLevel} RISK`} />} />
                  <Row label="TOTP enabled" value={id.totpEnabled ? 'Yes' : 'No'} />
                  <Row label="Created" value={fmt(id.createdAt)} />
                  <Row label="Updated" value={fmt(id.updatedAt)} />
                </Section>

                <Section title="KYC">
                  {!profile.kyc.exists ? (
                    <EmptyState title="No KYC profile" hint="The user has not started KYC." />
                  ) : (
                    <>
                      <Row label="Status" value={<StatusBadge status={profile.kyc.status ?? '—'} />} />
                      <Row label="Tier" value={profile.kyc.tier} />
                      <Row label="Full name" value={profile.kyc.fullName ?? '—'} />
                      <Row label="Provider" value={profile.kyc.provider ?? '—'} />
                      <Row label="Provider ref" value={profile.kyc.providerRef ?? '—'} />
                      <Row label="PAN" value={profile.kyc.panMasked ?? '—'} />
                      <Row label="Aadhaar" value={profile.kyc.aadhaarMasked ?? '—'} />
                      <Row label="Liveness" value={profile.kyc.livenessStatus ?? '—'} />
                      <Row label="Provider risk score" value={profile.kyc.riskScore ?? '—'} />
                      <Row label="Enhanced KYC required" value={profile.kyc.enhancedKycRequired ? 'Yes' : 'No'} />
                      <Row label="Submitted" value={fmt(profile.kyc.submittedAt)} />
                      <Row label="Reviewed" value={fmt(profile.kyc.reviewedAt)} />
                      <Row label="Reviewer" value={profile.kyc.reviewedByAdminId ? <ShortId id={profile.kyc.reviewedByAdminId} /> : '—'} />
                      {profile.kyc.rejectedReason && <Row label="Rejection reason" value={profile.kyc.rejectedReason} />}
                    </>
                  )}
                </Section>
              </div>

              <div className="space-y-4">
                <Section title="Account Actions">
                  <div className="space-y-2">
                    {id.accountStatus === 'FROZEN' ? (
                      <Button variant="success" disabled={busy || !canManageUsers} onClick={() => confirmStatus('ACTIVE')} className="w-full">
                        Unfreeze user
                      </Button>
                    ) : (
                      <Button variant="danger" disabled={busy || !canManageUsers} onClick={() => confirmStatus('FROZEN')} className="w-full">
                        Freeze user
                      </Button>
                    )}
                    {id.withdrawalsBlocked ? (
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
                    <p className="mt-3 text-xs text-muted">Your admin role can view users but cannot perform account actions.</p>
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
                      rows={6}
                      className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-brand focus:outline-none"
                      placeholder="Admin risk note"
                    />
                    <Button disabled={busy || !canManageRisk} onClick={() => saveRisk.mutate()} className="w-full">
                      Save risk note
                    </Button>
                  </div>
                </Section>
              </div>
            </div>
          )}

          {tab === 'Timeline' && <UserTimeline userId={id.id} />}

          {tab === 'Controls' && canViewControls && (
            <FeatureControls userId={id.id} canView={canViewControls} canUpdate={canUpdateControls} />
          )}

          {tab === 'Balances' && (
            <Section title="Balances">
              {profile.balances.length === 0 ? (
                <EmptyState title="No balances found" />
              ) : (
                <Table head={<><Th>Asset</Th><Th>Available</Th><Th>Locked</Th><Th>Total</Th></>}>
                  {profile.balances.map((b) => (
                    <tr key={b.asset} className="border-b border-line last:border-0">
                      <Td><span className="font-mono">{b.asset}</span></Td>
                      <Td><span className="font-mono">{b.available}</span></Td>
                      <Td><span className="font-mono">{b.locked}</span></Td>
                      <Td><span className="font-mono">{b.total}</span></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          )}

          {tab === 'INR' && (
            <div className="space-y-4">
              <Section title="INR Deposits">
                {inrDeposits.items.length === 0 ? (
                  <EmptyState title="No INR deposits" />
                ) : (
                  <>
                    <Table head={<><Th>Amount</Th><Th>Method / Ref</Th><Th>Status</Th><Th>Reviewed by</Th><Th>Created</Th></>}>
                      {inrDeposits.items.map((t) => (
                        <tr key={t.id} className="border-b border-line last:border-0">
                          <Td><span className="font-mono">₹{t.amount}</span></Td>
                          <Td>{t.method ?? t.provider ?? '—'}{t.utr ? <span className="block text-xs text-muted">{t.utr}</span> : null}</Td>
                          <Td><StatusBadge status={t.status} /></Td>
                          <Td>{t.reviewedByAdminId ? <ShortId id={t.reviewedByAdminId} /> : '—'}</Td>
                          <Td><span className="text-muted">{fmt(t.createdAt)}</span></Td>
                        </tr>
                      ))}
                    </Table>
                    <LoadMore {...inrDeposits} onClick={inrDeposits.loadMore} />
                  </>
                )}
              </Section>
              <Section title="INR Withdrawals">
                {inrWithdrawals.items.length === 0 ? (
                  <EmptyState title="No INR withdrawals" />
                ) : (
                  <>
                    <Table head={<><Th>Amount</Th><Th>Bank ref</Th><Th>Status</Th><Th>Reviewed by</Th><Th>Created</Th></>}>
                      {inrWithdrawals.items.map((t) => (
                        <tr key={t.id} className="border-b border-line last:border-0">
                          <Td><span className="font-mono">₹{t.amount}</span></Td>
                          <Td>{t.bankRef ?? '—'}</Td>
                          <Td><StatusBadge status={t.status} /></Td>
                          <Td>{t.reviewedByAdminId ? <ShortId id={t.reviewedByAdminId} /> : '—'}</Td>
                          <Td><span className="text-muted">{fmt(t.createdAt)}</span></Td>
                        </tr>
                      ))}
                    </Table>
                    <LoadMore {...inrWithdrawals} onClick={inrWithdrawals.loadMore} />
                  </>
                )}
              </Section>
            </div>
          )}

          {tab === 'Crypto' && (
            <div className="space-y-4">
              <Section title="Crypto Deposits">
                {cryptoDeposits.items.length === 0 ? (
                  <EmptyState title="No crypto deposits" />
                ) : (
                  <>
                    <Table head={<><Th>Asset</Th><Th>Chain</Th><Th>Amount</Th><Th>Tx</Th><Th>Conf.</Th><Th>Status</Th><Th>Detected</Th></>}>
                      {cryptoDeposits.items.map((d) => (
                        <tr key={d.id} className="border-b border-line last:border-0">
                          <Td><span className="font-mono">{d.asset}</span></Td>
                          <Td>{d.chain}</Td>
                          <Td><span className="font-mono">{d.amount}</span></Td>
                          <Td><span className="font-mono text-xs">{d.txHash.slice(0, 10)}…</span></Td>
                          <Td>{d.confirmations}/{d.reqConfirmations}</Td>
                          <Td><StatusBadge status={d.status} /></Td>
                          <Td><span className="text-muted">{fmt(d.detectedAt)}</span></Td>
                        </tr>
                      ))}
                    </Table>
                    <LoadMore {...cryptoDeposits} onClick={cryptoDeposits.loadMore} />
                  </>
                )}
              </Section>
              <Section title="Crypto Withdrawals">
                {cryptoWithdrawals.items.length === 0 ? (
                  <EmptyState title="No crypto withdrawals" />
                ) : (
                  <>
                    <Table head={<><Th>Asset</Th><Th>Chain</Th><Th>Amount</Th><Th>Tx</Th><Th>Status</Th><Th>Approved by</Th><Th>Requested</Th></>}>
                      {cryptoWithdrawals.items.map((w) => (
                        <tr key={w.id} className="border-b border-line last:border-0">
                          <Td><span className="font-mono">{w.asset}</span></Td>
                          <Td>{w.chain}</Td>
                          <Td><span className="font-mono">{w.amount}</span></Td>
                          <Td>{w.txHash ? <span className="font-mono text-xs">{w.txHash.slice(0, 10)}…</span> : '—'}</Td>
                          <Td><StatusBadge status={w.status} /></Td>
                          <Td>{w.approvedByAdminId ? <ShortId id={w.approvedByAdminId} /> : '—'}</Td>
                          <Td><span className="text-muted">{fmt(w.requestedAt)}</span></Td>
                        </tr>
                      ))}
                    </Table>
                    <LoadMore {...cryptoWithdrawals} onClick={cryptoWithdrawals.loadMore} />
                  </>
                )}
              </Section>
            </div>
          )}

          {tab === 'Orders & Trades' && (
            <div className="space-y-4">
              <Section title="Orders">
                {orders.items.length === 0 ? (
                  <EmptyState title="No orders" />
                ) : (
                  <>
                    <Table head={<><Th>Market</Th><Th>Side</Th><Th>Type</Th><Th>Price</Th><Th>Qty</Th><Th>Filled</Th><Th>Status</Th><Th>Created</Th></>}>
                      {orders.items.map((o) => (
                        <tr key={o.id} className="border-b border-line last:border-0">
                          <Td><span className="font-mono">{o.marketSymbol}</span></Td>
                          <Td>{o.side}</Td>
                          <Td>{o.type}</Td>
                          <Td><span className="font-mono">{o.price ?? '—'}</span></Td>
                          <Td><span className="font-mono">{o.quantity ?? '—'}</span></Td>
                          <Td><span className="font-mono">{o.filledQuantity}</span></Td>
                          <Td><StatusBadge status={o.status} /></Td>
                          <Td><span className="text-muted">{fmt(o.createdAt)}</span></Td>
                        </tr>
                      ))}
                    </Table>
                    <LoadMore {...orders} onClick={orders.loadMore} />
                  </>
                )}
              </Section>
              <Section title="Trades">
                {trades.items.length === 0 ? (
                  <EmptyState title="No trades" />
                ) : (
                  <>
                    <Table head={<><Th>Market</Th><Th>Side</Th><Th>Price</Th><Th>Qty</Th><Th>Fee</Th><Th>Executed</Th></>}>
                      {trades.items.map((t) => (
                        <tr key={`${t.id}-${t.seq}`} className="border-b border-line last:border-0">
                          <Td><span className="font-mono">{t.marketSymbol}</span></Td>
                          <Td>{t.side}</Td>
                          <Td><span className="font-mono">{t.price}</span></Td>
                          <Td><span className="font-mono">{t.quantity}</span></Td>
                          <Td><span className="font-mono">{t.fee}</span></Td>
                          <Td><span className="text-muted">{fmt(t.executedAt)}</span></Td>
                        </tr>
                      ))}
                    </Table>
                    <LoadMore {...trades} onClick={trades.loadMore} />
                  </>
                )}
              </Section>
            </div>
          )}

          {tab === 'Sessions' && (
            <Section title="Login / Session History">
              {sessions.items.length === 0 ? (
                <EmptyState title="No sessions" />
              ) : (
                <>
                  <Table head={<><Th>Session</Th><Th>IP</Th><Th>Created</Th><Th>Last seen</Th><Th>Expires</Th><Th>State</Th>{profile.meta.canRevokeSessions && <Th> </Th>}</>}>
                    {sessions.items.map((s) => (
                      <tr key={s.id} className="border-b border-line last:border-0">
                        <Td><ShortId id={s.id} /></Td>
                        <Td><span className="font-mono text-xs">{s.ip ?? '—'}</span></Td>
                        <Td><span className="text-muted">{fmt(s.createdAt)}</span></Td>
                        <Td><span className="text-muted">{fmt(s.lastSeenAt)}</span></Td>
                        <Td><span className="text-muted">{fmt(s.expiresAt)}</span></Td>
                        <Td>
                          {s.revokedAt ? (
                            <StatusBadge status="REVOKED" />
                          ) : s.active ? (
                            <StatusBadge status="ACTIVE" />
                          ) : (
                            <StatusBadge status="EXPIRED" />
                          )}
                        </Td>
                        {profile.meta.canRevokeSessions && (
                          <Td>
                            {s.active ? (
                              <Button
                                variant="danger"
                                className="px-2 py-1 text-xs"
                                disabled={revokeSession.isPending}
                                onClick={() => {
                                  if (window.confirm('Revoke this session? The user will be signed out on that device.')) {
                                    revokeSession.mutate(s.id);
                                  }
                                }}
                              >
                                Revoke
                              </Button>
                            ) : null}
                          </Td>
                        )}
                      </tr>
                    ))}
                  </Table>
                  <LoadMore {...sessions} onClick={sessions.loadMore} />
                </>
              )}
            </Section>
          )}

          {tab === 'Risk & Compliance' && profile.meta.complianceVisible && (
            <div className="space-y-4">
              <Section title="Screening Posture">
                {profile.riskCompliance.screening ? (
                  <>
                    <Row label="Sanctions" value={<StatusBadge status={profile.riskCompliance.screening.sanctionsStatus} />} />
                    <Row label="PEP" value={<StatusBadge status={profile.riskCompliance.screening.pepStatus} />} />
                    <Row label="Adverse media" value={<StatusBadge status={profile.riskCompliance.screening.adverseMediaStatus} />} />
                    <Row label="Compliance risk level" value={profile.riskCompliance.screening.complianceRiskLevel ?? '—'} />
                    <Row label="Compliance risk score" value={profile.riskCompliance.screening.complianceRiskScore ?? '—'} />
                  </>
                ) : (
                  <EmptyState title="No compliance profile" hint="The user has no compliance screening record yet." />
                )}
              </Section>

              <Section title="Manual Holds">
                <Row label="Under compliance review" value={profile.riskCompliance.manualHold.underComplianceReview ? 'Yes' : 'No'} />
                <Row label="Manual review before withdrawal" value={profile.riskCompliance.manualHold.manualReviewBeforeWithdrawal ? 'Yes' : 'No'} />
                <Row label="Block high-risk activity" value={profile.riskCompliance.manualHold.blockHighRiskActivity ? 'Yes' : 'No'} />
                <Row label="Force KYC review" value={profile.riskCompliance.manualHold.forceKycReview ? 'Yes' : 'No'} />
                <Row label="Require enhanced KYC" value={profile.riskCompliance.manualHold.requireEnhancedKyc ? 'Yes' : 'No'} />
              </Section>

              <Section title="Risk Flags">
                {profile.riskCompliance.flags.length === 0 ? (
                  <EmptyState title="No active risk flags" />
                ) : (
                  <Table head={<><Th>Kind</Th><Th>Label</Th><Th>Status</Th><Th>Level</Th><Th>Detail</Th><Th>When</Th></>}>
                    {profile.riskCompliance.flags.map((f, i) => (
                      <tr key={`${f.kind}-${i}`} className="border-b border-line last:border-0">
                        <Td>{f.kind}</Td>
                        <Td>{f.label}</Td>
                        <Td><StatusBadge status={f.status} /></Td>
                        <Td>{f.level ?? '—'}</Td>
                        <Td>{f.detail ?? '—'}</Td>
                        <Td><span className="text-muted">{fmt(f.createdAt)}</span></Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Section>

              <Section title="Open Compliance Cases">
                {profile.riskCompliance.openCases.length === 0 ? (
                  <EmptyState title="No open cases" />
                ) : (
                  <Table head={<><Th>Case</Th><Th>Type</Th><Th>Priority</Th><Th>Status</Th><Th>Title</Th><Th>Opened</Th></>}>
                    {profile.riskCompliance.openCases.map((c) => (
                      <tr key={c.id} className="border-b border-line last:border-0">
                        <Td>
                          <Link href={`/admin/compliance/cases/detail?id=${c.id}`} className="text-brand hover:underline">
                            <ShortId id={c.id} />
                          </Link>
                        </Td>
                        <Td>{c.type}</Td>
                        <Td>{c.priority}</Td>
                        <Td><StatusBadge status={c.status} /></Td>
                        <Td>{c.title}</Td>
                        <Td><span className="text-muted">{fmt(c.createdAt)}</span></Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Section>

              <ComplianceNotes
                userId={id.id}
                firstPage={profile.complianceNotes}
                canManage={profile.meta.canManageNotes}
              />
            </div>
          )}

          {tab === 'Audit Trail' && (
            <Section title="Admin Audit Trail">
              {audit.items.length === 0 ? (
                <EmptyState title="No admin actions on this user" />
              ) : (
                <>
                  <Table head={<><Th>Action</Th><Th>Admin</Th><Th>Reason</Th><Th>IP</Th><Th>When</Th></>}>
                    {audit.items.map((l) => (
                      <tr key={l.id} className="border-b border-line last:border-0">
                        <Td><span className="font-mono text-xs">{l.action}</span>{l.targetType ? <span className="block text-[11px] text-muted-2">{l.targetType}</span> : null}</Td>
                        <Td><ShortId id={l.adminId} /></Td>
                        <Td>{l.reason ?? '—'}</Td>
                        <Td><span className="font-mono text-xs">{l.ip ?? '—'}</span></Td>
                        <Td><span className="text-muted">{fmt(l.occurredAt)}</span></Td>
                      </tr>
                    ))}
                  </Table>
                  <LoadMore {...audit} onClick={audit.loadMore} />
                </>
              )}
            </Section>
          )}
        </>
      )}
    </main>
  );
}

/**
 * Read-only detail for an archived (soft-deleted) user (Stage 9C). Reached via
 * `?archived=1` from the Deleted Users tab. It calls GET /users/archived/:id and
 * renders a strictly read-only view: NONE of the active-user mutations (freeze,
 * withdrawal block, risk note, session revoke, controls) are rendered here, so an
 * archived account can never be edited from this page.
 */
function ArchivedUserDetailInner() {
  const ready = useGuard('admin');
  const search = useSearchParams();
  const userId = search.get('id') ?? '';

  const q = useQuery({
    queryKey: ['admin-user-archived', userId],
    queryFn: () => adminApi.archivedUserDetail(userId),
    enabled: ready && !!userId,
  });

  if (!ready) return null;
  const u = q.data?.data;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <Link href="/admin/users" className="mb-2 block text-xs text-brand hover:underline">
            Back to users
          </Link>
          <h1 className="text-xl font-semibold text-ink">Archived User</h1>
          {u && <p className="mt-0.5 text-sm text-muted">{u.email}</p>}
        </div>
        <Button onClick={() => q.refetch()} variant="secondary" disabled={!userId}>Refresh</Button>
      </div>

      {!userId && <Alert>User ID is required.</Alert>}
      {q.isLoading && <p className="text-sm text-muted">Loading archived user…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {u && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <StatusBadge status="ARCHIVED" />
            <StatusBadge status={u.accountStatus} />
            <StatusBadge status={u.kycStatus} />
          </div>

          <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This account is archived (soft-deleted). This is a <strong>read-only</strong>{' '}
            historical view — account actions are disabled. History is preserved for audit;
            records are never hard-deleted.
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Section title="Identity">
                <Row label="User ID" value={<span className="font-mono text-xs">{u.id}</span>} />
                <Row label="Email" value={u.email} />
                <Row label="Name" value={u.fullName ?? u.kycProfile?.fullName ?? '—'} />
                <Row label="KYC status" value={<StatusBadge status={u.kycStatus} />} />
                <Row label="Account status" value={<StatusBadge status={u.accountStatus} />} />
                <Row label="Last login" value={fmt(u.lastLoginAt)} />
                <Row label="Created" value={fmt(u.createdAt)} />
              </Section>

              <Section title="Balances (read-only)">
                {u.balances.length === 0 ? (
                  <EmptyState title="No balances" />
                ) : (
                  <Table head={<><Th>Asset</Th><Th>Available</Th><Th>Locked</Th><Th>Total</Th></>}>
                    {u.balances.map((b) => (
                      <tr key={b.asset} className="border-b border-line last:border-0">
                        <Td><span className="font-mono">{b.asset}</span></Td>
                        <Td><span className="font-mono">{b.available}</span></Td>
                        <Td><span className="font-mono">{b.locked}</span></Td>
                        <Td><span className="font-mono">{b.total}</span></Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Section>
            </div>

            <div className="space-y-4">
              <Section title="Archive Details">
                <Row label="Archived at" value={fmt(u.deletedAt)} />
                <Row
                  label="Archived by"
                  value={
                    u.deletedByAdminEmail ??
                    (u.deletedByAdminId ? <ShortId id={u.deletedByAdminId} /> : '—')
                  }
                />
                <Row label="Deletion reason" value={u.deletionReason ?? '—'} />
              </Section>
            </div>
          </div>

          {/* Preserved history (read-only) */}
          <div className="mt-4 space-y-4">
            <Section title="Login / Session History">
              {u.sessions.length === 0 ? (
                <EmptyState title="No sessions" />
              ) : (
                <Table head={<><Th>Session</Th><Th>IP</Th><Th>Created</Th><Th>Expires</Th><Th>State</Th></>}>
                  {u.sessions.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <Td><ShortId id={s.id} /></Td>
                      <Td><span className="font-mono text-xs">{s.ip ?? '—'}</span></Td>
                      <Td><span className="text-muted">{fmt(s.createdAt)}</span></Td>
                      <Td><span className="text-muted">{fmt(s.expiresAt)}</span></Td>
                      <Td>{s.revokedAt ? <StatusBadge status="REVOKED" /> : <StatusBadge status="EXPIRED" />}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>

            <Section title="INR Transactions">
              {u.inrTransactions.length === 0 ? (
                <EmptyState title="No INR transactions" />
              ) : (
                <Table head={<><Th>Type</Th><Th>Amount</Th><Th>Status</Th><Th>Method / Ref</Th><Th>Created</Th></>}>
                  {u.inrTransactions.map((t) => (
                    <tr key={t.id} className="border-b border-line last:border-0">
                      <Td>{t.type}</Td>
                      <Td><span className="font-mono">₹{t.amount}</span></Td>
                      <Td><StatusBadge status={t.status} /></Td>
                      <Td>{t.method ?? t.provider ?? '—'}{t.utr ? <span className="block text-xs text-muted">{t.utr}</span> : null}</Td>
                      <Td><span className="text-muted">{fmt(t.createdAt)}</span></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>

            <Section title="Orders">
              {u.orders.length === 0 ? (
                <EmptyState title="No orders" />
              ) : (
                <Table head={<><Th>Market</Th><Th>Side</Th><Th>Type</Th><Th>Qty</Th><Th>Status</Th><Th>Created</Th></>}>
                  {u.orders.map((o) => (
                    <tr key={o.id} className="border-b border-line last:border-0">
                      <Td><span className="font-mono">{o.marketSymbol}</span></Td>
                      <Td>{o.side}</Td>
                      <Td>{o.type}</Td>
                      <Td><span className="font-mono">{o.quantity ?? '—'}</span></Td>
                      <Td><StatusBadge status={o.status} /></Td>
                      <Td><span className="text-muted">{fmt(o.createdAt)}</span></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>

            <Section title="Admin Audit Trail">
              {u.adminLogs.length === 0 ? (
                <EmptyState title="No admin actions on this user" />
              ) : (
                <Table head={<><Th>Action</Th><Th>Reason</Th><Th>When</Th></>}>
                  {u.adminLogs.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <Td><span className="font-mono text-xs">{l.action}</span></Td>
                      <Td>{l.reason ?? '—'}</Td>
                      <Td><span className="text-muted">{fmt(l.occurredAt)}</span></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </div>
        </>
      )}
    </main>
  );
}

/** Dispatch to the read-only archived view when `?archived=1`, else the normal
 *  active-user profile. Kept inside Suspense so useSearchParams is safe. */
function AdminUserDetailRouter() {
  const search = useSearchParams();
  const archived = search.get('archived') === '1';
  return archived ? <ArchivedUserDetailInner /> : <AdminUserDetailInner />;
}

export default function AdminUserDetailPage() {
  return (
    <Suspense fallback={null}>
      <AdminUserDetailRouter />
    </Suspense>
  );
}
