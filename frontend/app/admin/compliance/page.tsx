'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import type { ComplianceDashboardFilters } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

function fmt(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleString() : '—';
}

function Card({ label, val, hint, href }: { label: string; val: ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="relative rounded-xl border border-white/5 bg-white/[0.01] p-4 min-h-[92px] flex flex-col justify-between overflow-hidden hover:border-gold/20 transition">
      <div className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-b from-gold/5 to-transparent opacity-25" />
      <span className="relative z-10 text-[9px] font-bold text-white/40 uppercase tracking-wider">{label}</span>
      <span className="relative z-10 text-2xl font-black text-white font-mono leading-tight">{val}</span>
      {hint && <span className="relative z-10 text-[9px] text-white/30">{hint}</span>}
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

function Queue({
  title,
  href,
  count,
  empty,
  children,
}: {
  title: string;
  href: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5">
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">{title}</h3>
        <a href={href} className="text-[10px] text-gold hover:underline">View all →</a>
      </div>
      {count === 0 ? (
        <p className="py-8 text-center text-xs text-white/35">{empty}</p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  );
}

function Pill({ text }: { text: string }) {
  const t = text.toUpperCase();
  const cls =
    ['HIGH', 'CRITICAL', 'BLOCKED', 'HIT', 'REJECTED', 'PROHIBITED'].some((k) => t.includes(k))
      ? 'bg-red-500/15 text-red-300'
      : ['MEDIUM', 'REVIEW', 'PENDING', 'OPEN', 'SUBMITTED'].some((k) => t.includes(k))
        ? 'bg-gold/15 text-gold'
        : 'bg-white/5 text-white/50';
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>{text}</span>;
}

const RISK_LEVELS = ['', 'LOW', 'MEDIUM', 'HIGH', 'PROHIBITED'];
const CASE_STATUSES = ['', 'OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED', 'CLOSED'];
const ALERT_TYPES = [
  '',
  'HIGH_VALUE_WITHDRAWAL',
  'RAPID_DEPOSIT_WITHDRAWAL',
  'STRUCTURING_PATTERN',
  'ABNORMAL_TRADING_VOLUME',
  'REPEATED_FAILED_WITHDRAWALS',
  'HIGH_RISK_USER_ACTIVITY',
  'SCREENING_RISK_ACTIVITY',
  'WALLET_RISK_ACTIVITY',
];

const selectCls =
  'rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:border-gold/40 focus:outline-none';

export default function AdminCompliancePage() {
  const ready = useGuard('admin');
  const [filters, setFilters] = useState<ComplianceDashboardFilters>({});

  const q = useQuery({
    queryKey: ['admin-compliance-dashboard', filters],
    queryFn: () => adminApi.complianceDashboard(filters),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const d = q.data?.data;
  const set = (patch: Partial<ComplianceDashboardFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const cards = d
    ? [
        { label: 'Pending KYC reviews', val: d.cards.pendingKycReviews, href: '/admin/compliance/users' },
        { label: 'Enhanced KYC required', val: d.cards.enhancedKycRequired, href: '/admin/compliance/users' },
        { label: 'High-risk users', val: d.cards.highRiskUsers, href: '/admin/compliance/users' },
        { label: 'Open cases', val: d.cards.openCases, href: '/admin/compliance/cases' },
        { label: 'High / critical cases', val: d.cards.highCriticalCases, href: '/admin/compliance/cases' },
        { label: 'Open alerts', val: d.cards.openAlerts, href: '/admin/compliance/cases' },
        { label: 'Pending withdrawal reviews', val: d.cards.pendingWithdrawalReviews, href: '/admin/withdrawals' },
        { label: 'Screening flags', val: d.cards.screeningFlaggedUsers, hint: 'sanctions / PEP / adverse media', href: '/admin/compliance/users' },
        { label: 'Wallet-risk alerts', val: d.cards.walletRiskAlerts, href: '/admin/compliance/wallet-risk' },
        { label: 'Open STR/SAR drafts', val: d.cards.openStrDrafts, hint: 'internal drafts only', href: '/admin/compliance/fiu' },
      ]
    : [];

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-10">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-[1300px] px-6 pt-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Compliance &amp; Risk Dashboard</h1>
            <p className="text-xs text-white/50 mt-1">Real KYC, case, alert and risk data across all users. No sample data. Internal workflow only — not a regulatory filing.</p>
          </div>
          <div className="flex gap-2">
            <a href="/admin/kyc" className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider">KYC queue →</a>
            <a href="/admin/compliance/cases" className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/5 transition uppercase tracking-wider">Cases →</a>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/35">Filters</span>
          <select className={selectCls} value={filters.riskLevel ?? ''} onChange={(e) => set({ riskLevel: e.target.value || undefined })}>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{r ? `Risk: ${r}` : 'Risk: any'}</option>)}
          </select>
          <select className={selectCls} value={filters.caseStatus ?? ''} onChange={(e) => set({ caseStatus: e.target.value || undefined })}>
            {CASE_STATUSES.map((s) => <option key={s} value={s}>{s ? `Case: ${s}` : 'Case: open'}</option>)}
          </select>
          <select className={selectCls} value={filters.alertType ?? ''} onChange={(e) => set({ alertType: e.target.value || undefined })}>
            {ALERT_TYPES.map((a) => <option key={a} value={a}>{a ? a.replace(/_/g, ' ') : 'Alert: any'}</option>)}
          </select>
          <input type="date" className={selectCls} value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} title="From date" />
          <input type="date" className={selectCls} value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} title="To date" />
          {(filters.riskLevel || filters.caseStatus || filters.alertType || filters.from || filters.to) && (
            <button className="text-[10px] text-gold hover:underline" onClick={() => setFilters({})}>Clear</button>
          )}
        </div>

        {q.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
            {errorMessage(q.error)} — compliance.view permission is required.
          </div>
        )}
        {q.isLoading && <p className="text-sm text-white/40">Loading compliance metrics…</p>}

        {d && (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {cards.map((c) => <Card key={c.label} {...c} />)}
            </div>

            {/* Queues */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Queue title="KYC review queue" href="/admin/compliance/users" count={d.queues.kycReview.length} empty="No KYC reviews pending.">
                {d.queues.kycReview.map((i) => (
                  <a key={i.userId} href={`/admin/users/detail?id=${i.userId}`} className="flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-0 hover:text-gold">
                    <span className="truncate flex-1 text-white/80">{i.email}</span>
                    <Pill text={i.status} />
                    <Pill text={i.riskLevel} />
                    <span className="text-white/30 shrink-0">{fmt(i.submittedAt)}</span>
                  </a>
                ))}
              </Queue>

              <Queue title="Risk review queue" href="/admin/compliance/users" count={d.queues.riskReview.length} empty="No high-risk users.">
                {d.queues.riskReview.map((i) => (
                  <a key={i.userId} href={`/admin/users/detail?id=${i.userId}`} className="flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-0 hover:text-gold">
                    <span className="truncate flex-1 text-white/80">{i.email}</span>
                    <Pill text={i.riskLevel} />
                    <span className="font-mono text-white/40">{i.riskScore}</span>
                    <span className="text-white/30 shrink-0 truncate max-w-[160px]">{i.riskReason ?? '—'}</span>
                  </a>
                ))}
              </Queue>

              <Queue title="Withdrawal / manual review" href="/admin/withdrawals" count={d.queues.withdrawalReview.length} empty="No withdrawals awaiting review.">
                {d.queues.withdrawalReview.map((i) => (
                  <a key={i.id} href={`/admin/users/detail?id=${i.userId}`} className="flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-0 hover:text-gold">
                    <span className="truncate flex-1 text-white/80">{i.email}</span>
                    <span className="font-mono text-white/60">{i.amount} {i.asset}</span>
                    <Pill text={i.status} />
                    <span className="text-white/30 shrink-0">{fmt(i.requestedAt)}</span>
                  </a>
                ))}
              </Queue>

              <Queue title="Open compliance cases" href="/admin/compliance/cases" count={d.queues.openCases.length} empty="No open cases.">
                {d.queues.openCases.map((i) => (
                  <a key={i.id} href={`/admin/compliance/cases/detail?id=${i.id}`} className="flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-0 hover:text-gold">
                    <span className="truncate flex-1 text-white/80">{i.title}</span>
                    <Pill text={i.priority} />
                    <Pill text={i.status} />
                    <span className="text-white/30 shrink-0">{fmt(i.createdAt)}</span>
                  </a>
                ))}
              </Queue>

              <Queue title="STR/SAR drafts (internal)" href="/admin/compliance/fiu" count={d.queues.strDrafts.length} empty="No open draft reports.">
                {d.queues.strDrafts.map((i) => (
                  <a key={i.id} href={`/admin/compliance/fiu/detail?id=${i.id}`} className="flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-0 hover:text-gold">
                    <span className="truncate flex-1 text-white/80">{i.title}</span>
                    <Pill text={i.reportType} />
                    <Pill text={i.status} />
                    <span className="text-white/30 shrink-0">{fmt(i.createdAt)}</span>
                  </a>
                ))}
              </Queue>

              <Queue title="Recent screening alerts" href="/admin/compliance/cases" count={d.queues.recentAlerts.length} empty="No open alerts.">
                {d.queues.recentAlerts.map((i) => (
                  <a key={i.id} href={`/admin/users/detail?id=${i.userId}`} className="flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-0 hover:text-gold">
                    <span className="truncate flex-1 text-white/80">{i.title}</span>
                    <Pill text={i.priority} />
                    <span className="font-mono text-white/40">{i.score}</span>
                    <span className="text-white/30 shrink-0">{fmt(i.createdAt)}</span>
                  </a>
                ))}
              </Queue>

              <Queue title="Wallet-risk alerts" href="/admin/compliance/wallet-risk" count={d.queues.walletRisk.length} empty="No wallet-risk alerts.">
                {d.queues.walletRisk.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-0">
                    <span className="truncate flex-1 font-mono text-white/70">{i.chain}:{i.address}</span>
                    <Pill text={i.level} />
                    <Pill text={i.status} />
                    <span className="text-white/30 shrink-0">{fmt(i.checkedAt)}</span>
                  </div>
                ))}
              </Queue>
            </div>

            <p className="text-[10px] text-white/25 pt-2">{d.meta.note}</p>
          </>
        )}
      </main>
    </div>
  );
}
