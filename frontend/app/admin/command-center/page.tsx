'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';

function fmt(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleString() : '—';
}

function Card({ label, val, tone }: { label: string; val: ReactNode; tone?: 'warn' | 'bad' | 'good' }) {
  const valCls = tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-gold' : tone === 'good' ? 'text-emerald-300' : 'text-white';
  return (
    <div className="relative rounded-xl border border-white/5 bg-white/[0.01] p-4 min-h-[88px] flex flex-col justify-between overflow-hidden">
      <div className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-b from-gold/5 to-transparent opacity-25" />
      <span className="relative z-10 text-[9px] font-bold text-white/40 uppercase tracking-wider">{label}</span>
      <span className={`relative z-10 text-2xl font-black font-mono leading-tight ${valCls}`}>{val}</span>
    </div>
  );
}

function Panel({ title, href, count, empty, children }: { title: string; href?: string; count: number; empty: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5">
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">{title}</h3>
        {href && <a href={href} className="text-[10px] text-gold hover:underline">View all →</a>}
      </div>
      {count === 0 ? <p className="py-6 text-center text-xs text-white/35">{empty}</p> : <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

function Pill({ text }: { text: string }) {
  const t = text.toUpperCase();
  const cls = ['HIGH', 'CRITICAL', 'BLOCKED', 'HIT', 'FAILED', 'PROHIBITED'].some((k) => t.includes(k))
    ? 'bg-red-500/15 text-red-300'
    : ['MEDIUM', 'REVIEW', 'PENDING', 'OPEN', 'INITIATED'].some((k) => t.includes(k))
      ? 'bg-gold/15 text-gold'
      : 'bg-white/5 text-white/50';
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>{text}</span>;
}

function Line({ href, children }: { href?: string; children: ReactNode }) {
  const cls = 'flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-0';
  return href ? <a href={href} className={`${cls} hover:text-gold`}>{children}</a> : <div className={cls}>{children}</div>;
}

const QUICK_LINKS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/kyc', label: 'KYC' },
  { href: '/admin/compliance', label: 'Compliance' },
  { href: '/admin/deposits', label: 'Deposits' },
  { href: '/admin/withdrawals', label: 'Withdrawals' },
  { href: '/admin/compliance/wallet-risk', label: 'Wallet Risk' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/system', label: 'System' },
];

export default function CommandCenterPage() {
  const ready = useGuard('admin');
  const q = useQuery({
    queryKey: ['admin-command-center'],
    queryFn: () => adminApi.commandCenter(),
    enabled: ready,
    retry: false,
    refetchInterval: 60000,
  });

  if (!ready) return null;
  const d = q.data?.data;

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-10">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />

      <main className="relative z-10 mx-auto max-w-[1300px] px-6 pt-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Command Center</h1>
            <p className="text-xs text-white/50 mt-1">Live exchange operations overview. Real data only — empty queues show a clean state.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] font-bold text-white/70 hover:bg-white/5 hover:text-gold transition uppercase tracking-wider">{l.label}</a>
            ))}
          </div>
        </div>

        {q.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)} — operations.view permission is required.</div>}
        {q.isLoading && <p className="text-sm text-white/40">Loading command center…</p>}

        {d && (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-3">
              <Card label="Total users" val={d.cards.totalUsers} />
              <Card label="New today" val={d.cards.newUsersToday} tone="good" />
              <Card label="Pending KYC" val={d.cards.pendingKyc} tone={d.cards.pendingKyc > 0 ? 'warn' : undefined} />
              <Card label="Enhanced KYC req." val={d.cards.enhancedKycRequired} />
              <Card label="Open cases" val={d.cards.openCases} tone={d.cards.openCases > 0 ? 'warn' : undefined} />
              <Card label="Open alerts" val={d.cards.openAlerts} tone={d.cards.openAlerts > 0 ? 'warn' : undefined} />
              <Card label="INR deposits" val={d.cards.pendingInrDeposits} tone={d.cards.pendingInrDeposits > 0 ? 'warn' : undefined} />
              <Card label="INR withdrawals" val={d.cards.pendingInrWithdrawals} tone={d.cards.pendingInrWithdrawals > 0 ? 'warn' : undefined} />
              <Card label="Crypto withdrawals" val={d.cards.pendingCryptoWithdrawals} tone={d.cards.pendingCryptoWithdrawals > 0 ? 'warn' : undefined} />
              <Card label="Failed payments 24h" val={d.cards.failedPaymentEvents} tone={d.cards.failedPaymentEvents > 0 ? 'bad' : undefined} />
              <Card label="Active sessions" val={d.cards.activeSessions} />
              <Card label="Admin actions today" val={d.cards.adminActionsToday} />
              <Card label="System health" val={d.cards.systemHealth.toUpperCase()} tone={d.cards.systemHealth === 'ok' ? 'good' : d.cards.systemHealth === 'degraded' ? 'warn' : 'bad'} />
            </div>

            {/* Operations + Risk queues */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Panel title="Operations queue — INR deposits" href="/admin/deposits" count={d.operationsQueue.pendingInrDeposits.length} empty="No items pending.">
                {d.operationsQueue.pendingInrDeposits.map((i) => (
                  <Line key={i.id} href={`/admin/users/detail?id=${i.userId}`}>
                    <span className="truncate flex-1 text-white/80">{i.email}</span>
                    <span className="font-mono text-white/60">₹{i.amount}</span>
                    <Pill text={i.status} />
                    <span className="text-white/30 shrink-0">{fmt(i.createdAt)}</span>
                  </Line>
                ))}
              </Panel>

              <Panel title="Operations queue — crypto withdrawals" href="/admin/withdrawals" count={d.operationsQueue.cryptoWithdrawalsForReview.length} empty="No items pending.">
                {d.operationsQueue.cryptoWithdrawalsForReview.map((i) => (
                  <Line key={i.id} href={`/admin/users/detail?id=${i.userId}`}>
                    <span className="truncate flex-1 text-white/80">{i.email}</span>
                    <span className="font-mono text-white/60">{i.amount} {i.asset}</span>
                    <Pill text={i.status} />
                    <span className="text-white/30 shrink-0">{fmt(i.requestedAt)}</span>
                  </Line>
                ))}
              </Panel>

              <Panel title="Pending KYC reviews" href="/admin/kyc" count={d.operationsQueue.pendingKycReviews.length} empty="No KYC reviews pending.">
                {d.operationsQueue.pendingKycReviews.map((i) => (
                  <Line key={i.userId} href={`/admin/users/detail?id=${i.userId}`}>
                    <span className="truncate flex-1 text-white/80">{i.email}</span>
                    <Pill text={i.kycStatus} />
                    <Pill text={i.riskLevel} />
                    <span className="text-white/30 shrink-0">{fmt(i.createdAt)}</span>
                  </Line>
                ))}
              </Panel>

              <Panel title="Risk queue — high-risk users" href="/admin/compliance/users" count={d.riskQueue.highRiskUsers.length} empty="No high-risk users.">
                {d.riskQueue.highRiskUsers.map((i) => (
                  <Line key={i.userId} href={`/admin/users/detail?id=${i.userId}`}>
                    <span className="truncate flex-1 text-white/80">{i.email}</span>
                    <Pill text={i.riskLevel} />
                    <span className="text-white/30 shrink-0 truncate max-w-[160px]">{i.riskNote ?? '—'}</span>
                  </Line>
                ))}
              </Panel>

              <Panel title="Risk queue — compliance alerts" href="/admin/compliance/cases" count={d.riskQueue.complianceAlerts.length} empty="No open alerts.">
                {d.riskQueue.complianceAlerts.map((i) => (
                  <Line key={i.id} href={`/admin/users/detail?id=${i.userId}`}>
                    <span className="truncate flex-1 text-white/80">{i.title}</span>
                    <Pill text={i.priority} />
                    <span className="font-mono text-white/40">{i.score}</span>
                    <span className="text-white/30 shrink-0">{fmt(i.createdAt)}</span>
                  </Line>
                ))}
              </Panel>

              <Panel title="Risk queue — wallet risk" href="/admin/compliance/wallet-risk" count={d.riskQueue.walletRiskAlerts.length} empty="No wallet-risk alerts.">
                {d.riskQueue.walletRiskAlerts.map((i) => (
                  <Line key={i.id}>
                    <span className="truncate flex-1 font-mono text-white/70">{i.chain}:{i.address}</span>
                    <Pill text={i.level} />
                    <Pill text={i.status} />
                    <span className="text-white/30 shrink-0">{fmt(i.checkedAt)}</span>
                  </Line>
                ))}
              </Panel>
            </div>

            {/* Recent activity + system health */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Panel title="Recent signups" href="/admin/users" count={d.recentActivity.signups.length} empty="No recent signups.">
                {d.recentActivity.signups.map((i) => (
                  <Line key={i.userId} href={`/admin/users/detail?id=${i.userId}`}>
                    <span className="truncate flex-1 text-white/80">{i.email}</span>
                    <Pill text={i.kycStatus} />
                    <span className="text-white/30 shrink-0">{fmt(i.createdAt)}</span>
                  </Line>
                ))}
              </Panel>

              <Panel title="Recent admin actions" href="/admin/audit" count={d.recentActivity.adminActions.length} empty="No recent admin actions.">
                {d.recentActivity.adminActions.map((i) => (
                  <Line key={i.id}>
                    <span className="truncate flex-1 font-mono text-white/70">{i.action}</span>
                    <span className="text-white/40 truncate max-w-[120px]">{i.adminEmail ?? i.adminId.slice(0, 8)}</span>
                    <span className="text-white/30 shrink-0">{fmt(i.occurredAt)}</span>
                  </Line>
                ))}
              </Panel>

              <Panel title="Recent security events" count={d.recentActivity.securityEvents.length} empty="No recent security events.">
                {d.recentActivity.securityEvents.map((i) => (
                  <Line key={i.id}>
                    <span className="truncate flex-1 font-mono text-white/70">{i.action}</span>
                    <span className="font-mono text-white/40">{i.ip ?? '—'}</span>
                    <span className="text-white/30 shrink-0">{fmt(i.occurredAt)}</span>
                  </Line>
                ))}
              </Panel>
            </div>

            {/* System health detail */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">System health</h3>
                <a href="/admin/system" className="text-[10px] text-gold hover:underline">Ops center →</a>
              </div>
              {!d.systemHealth.available ? (
                <p className="py-4 text-center text-xs text-white/35">Health probe not available.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-4 text-[11px]">
                  <span>Status: <Pill text={d.systemHealth.status} /></span>
                  <span className="text-white/50">Version: <span className="font-mono text-white/70">{d.systemHealth.version ?? '—'}</span></span>
                  <span className="text-white/50">Uptime: <span className="font-mono text-white/70">{d.systemHealth.uptimeSec != null ? `${Math.floor(d.systemHealth.uptimeSec / 60)}m` : '—'}</span></span>
                  {d.systemHealth.dependencies.map((dep) => (
                    <span key={dep.name} className="text-white/50">{dep.name}: <Pill text={dep.status} /></span>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-white/25 pt-2">{d.meta.note}</p>
          </>
        )}
      </main>
    </div>
  );
}
