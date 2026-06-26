'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';

/* ------------------------------------------------------------------ */
/* Small presentational helpers (match the admin dashboard styling).  */
/* ------------------------------------------------------------------ */

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'muted';
const toneCls: Record<Tone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  bad: 'bg-red-500/15 text-red-400 border-red-500/30',
  muted: 'bg-white/5 text-white/50 border-white/10',
};

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${toneCls[tone]}`}>
      {children}
    </span>
  );
}

function StatTile({ label, value, tone = 'muted', hint }: { label: string; value: ReactNode; tone?: Tone; hint?: string }) {
  const valColor = tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-red-400' : 'text-white';
  return (
    <div className="relative rounded-xl border border-white/5 bg-white/[0.01] p-4 overflow-hidden">
      <div className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-b from-gold/5 to-transparent opacity-25" />
      <div className="relative z-10">
        <span className="block text-[9px] font-bold uppercase tracking-widest text-white/40">{label}</span>
        <span className={`mt-1 block font-mono text-2xl font-black leading-tight ${valColor}`}>{value}</span>
        {hint && <span className="mt-0.5 block text-[10px] text-white/30">{hint}</span>}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 text-xs last:border-0">
      <span className="text-white/45">{label}</span>
      <span className="font-mono font-medium text-white/90">{value}</span>
    </div>
  );
}

function statusTone(status?: string): Tone {
  if (status === 'ok') return 'ok';
  if (status === 'degraded' || status === 'down') return 'bad';
  return 'muted';
}

// Stage 9 tone mappings.
function readyTone(status?: string): Tone {
  if (status === 'healthy') return 'ok';
  if (status === 'degraded') return 'warn';
  if (status === 'unhealthy') return 'bad';
  return 'muted';
}
function checkTone(status?: string): Tone {
  if (status === 'pass') return 'ok';
  if (status === 'warn') return 'warn';
  if (status === 'fail') return 'bad';
  return 'muted';
}
function backupItemTone(status?: string): Tone {
  if (status === 'ok') return 'ok';
  if (status === 'action_required') return 'bad';
  return 'warn';
}
function guardrailTone(state?: string): Tone {
  if (state === 'enforced') return 'ok';
  if (state === 'partial') return 'warn';
  return 'muted';
}
// Stage 10 go-live tone mappings.
function goLiveTone(status?: string): Tone {
  if (status === 'ready') return 'ok';
  if (status === 'warning') return 'warn';
  if (status === 'blocked') return 'bad';
  return 'muted';
}
function goLiveCheckTone(status?: string): Tone {
  if (status === 'ok') return 'ok';
  if (status === 'warning') return 'warn';
  if (status === 'blocked') return 'bad';
  return 'muted';
}

function fmtUptime(seconds?: number): string {
  if (!seconds && seconds !== 0) return '—';
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminSystemPage() {
  const ready = useGuard('admin');

  const overview = useQuery({
    queryKey: ['system-overview'],
    queryFn: () => adminApi.systemOverview(),
    enabled: ready,
    retry: false,
    refetchInterval: 15000,
  });
  const queues = useQuery({
    queryKey: ['system-queues'],
    queryFn: () => adminApi.systemQueues(),
    enabled: ready,
    retry: false,
    refetchInterval: 15000,
  });
  const scanner = useQuery({
    queryKey: ['system-scanner'],
    queryFn: () => adminApi.systemScanner(),
    enabled: ready,
    retry: false,
    refetchInterval: 15000,
  });
  const mail = useQuery({
    queryKey: ['system-mail'],
    queryFn: () => adminApi.systemMail(),
    enabled: ready,
    retry: false,
    refetchInterval: 30000,
  });
  const risk = useQuery({
    queryKey: ['system-risk'],
    queryFn: () => adminApi.systemRiskAlerts(),
    enabled: ready,
    retry: false,
    refetchInterval: 30000,
  });
  // Stage 9 — production readiness pack.
  const readiness = useQuery({
    queryKey: ['system-readiness'],
    queryFn: () => adminApi.systemReadiness(),
    enabled: ready,
    retry: false,
    refetchInterval: 15000,
  });
  const backup = useQuery({
    queryKey: ['system-backup'],
    queryFn: () => adminApi.systemBackupStatus(),
    enabled: ready,
    retry: false,
    refetchInterval: 60000,
  });
  const monitoring = useQuery({
    queryKey: ['system-monitoring'],
    queryFn: () => adminApi.systemMonitoring(),
    enabled: ready,
    retry: false,
    refetchInterval: 60000,
  });
  const guardrails = useQuery({
    queryKey: ['system-guardrails'],
    queryFn: () => adminApi.systemGuardrails(),
    enabled: ready,
    retry: false,
    refetchInterval: 60000,
  });
  // Stage 10 — production go-live readiness.
  const goLive = useQuery({
    queryKey: ['system-go-live'],
    queryFn: () => adminApi.systemGoLiveReadiness(),
    enabled: ready,
    retry: false,
    refetchInterval: 60000,
  });

  if (!ready) return null;

  const o = overview.data?.data;
  const q = queues.data?.data;
  const sc = scanner.data?.data;
  const ml = mail.data?.data;
  const rk = risk.data?.data;
  const rd = readiness.data?.data;
  const bk = backup.data?.data;
  const mon = monitoring.data?.data;
  const gr = guardrails.data?.data;
  const gl = goLive.data?.data;

  const refreshAll = () => {
    overview.refetch();
    queues.refetch();
    scanner.refetch();
    mail.refetch();
    risk.refetch();
    readiness.refetch();
    backup.refetch();
    monitoring.refetch();
    guardrails.refetch();
    goLive.refetch();
  };

  const dbTone = statusTone(o?.dependencies.database);
  const redisTone = statusTone(o?.dependencies.redis);

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-12">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-[1500px] px-6 pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              System / Ops Center
              {o && <Badge tone={statusTone(o.status)}>{o.status}</Badge>}
            </h1>
            <p className="text-xs text-white/50 mt-1">
              Live platform health, operational queues, and risk signals. Read-only · refreshes automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refreshAll}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:text-gold hover:border-gold/30 transition"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {overview.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
            {errorMessage(overview.error)} — the System overview needs the <code>system.view</code> permission.
          </div>
        )}

        {/* 1. Top summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <StatTile label="Platform" value={o?.status ?? '—'} tone={statusTone(o?.status)} />
          <StatTile label="Database" value={o?.dependencies.database ?? '—'} tone={dbTone} />
          <StatTile label="Redis" value={o?.dependencies.redis ?? '—'} tone={redisTone} />
          <StatTile label="Pending Deposits" value={o?.summary.pendingInrDeposits ?? '—'} tone={(o?.summary.pendingInrDeposits ?? 0) > 0 ? 'warn' : 'ok'} />
          <StatTile label="Pending Withdrawals" value={o?.summary.pendingWithdrawals ?? '—'} tone={(o?.summary.pendingWithdrawals ?? 0) > 0 ? 'warn' : 'ok'} />
          <StatTile label="KYC Pending" value={o?.summary.kycPending ?? '—'} tone={(o?.summary.kycPending ?? 0) > 0 ? 'warn' : 'ok'} />
          <StatTile label="Mail Failures (24h)" value={o?.summary.mailFailures ?? '—'} tone={(o?.summary.mailFailures ?? 0) > 0 ? 'bad' : 'ok'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 2. Health panel */}
          <Panel title="API / Admin Readiness">
            {o ? (
              <div>
                <KV label="Status" value={<Badge tone={statusTone(o.status)}>{o.status}</Badge>} />
                <KV label="Database" value={<Badge tone={dbTone}>{o.dependencies.database}</Badge>} />
                <KV label="Redis" value={<Badge tone={redisTone}>{o.dependencies.redis}</Badge>} />
                <KV label="Version" value={o.version} />
                <KV label="Environment" value={o.environment} />
                <KV label="Uptime" value={fmtUptime(o.uptime)} />
                <KV label="Checked at" value={new Date(o.timestamp).toLocaleString()} />
              </div>
            ) : (
              <p className="text-xs text-white/40">{overview.isLoading ? 'Loading…' : 'Unavailable.'}</p>
            )}
          </Panel>

          {/* 4. Mail panel */}
          <Panel title="Mail / Notifications">
            {mail.isError ? (
              <p className="text-xs text-white/40">Requires <code>system.view</code>.</p>
            ) : ml ? (
              <div>
                <KV
                  label="Provider"
                  value={<Badge tone={ml.provider === 'ses' ? 'ok' : 'warn'}>{ml.provider.toUpperCase()}</Badge>}
                />
                <KV label="From domain" value={ml.fromDomain ?? '—'} />
                <KV label="Region" value={ml.region ?? '—'} />
                <KV label="Reply-To configured" value={ml.replyToConfigured ? 'yes' : 'no'} />
                <KV label="SES config set" value={ml.configurationSetConfigured ? 'yes' : 'no'} />
                <KV
                  label={`Failures (last ${ml.windowHours}h)`}
                  value={<span className={ml.recentFailures > 0 ? 'text-red-400' : 'text-emerald-400'}>{ml.recentFailures}</span>}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(ml.statusCounts).length === 0 ? (
                    <span className="text-[11px] text-white/30">No notification emails in window.</span>
                  ) : (
                    Object.entries(ml.statusCounts).map(([k, v]) => (
                      <span key={k} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] font-mono text-white/75">
                        {k}: {v}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-white/40">{mail.isLoading ? 'Loading…' : 'Unavailable.'}</p>
            )}
          </Panel>
        </div>

        {/* 3. Scanner panel */}
        <Panel title="Blockchain Scanner">
          {scanner.isError ? (
            <p className="text-xs text-white/40">Requires <code>system.view</code>.</p>
          ) : sc ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-white/50">
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Safety lag: <b className="text-white/80">{sc.safetyLag}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Reorg buffer: <b className="text-white/80">{sc.reorgBuffer}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Start block: <b className="text-white/80">{sc.startBlock}</b></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-white/40 border-b border-white/5">
                      <th className="py-2 pr-3">Chain</th>
                      <th className="py-2 pr-3">Provider</th>
                      <th className="py-2 pr-3">Last scanned</th>
                      <th className="py-2 pr-3">Safe block</th>
                      <th className="py-2 pr-3">Last hash</th>
                      <th className="py-2 pr-3">Updated</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-white/80">
                    {sc.chains.map((c) => {
                      const live = c.providerMode === 'live';
                      const stale = c.updatedAt ? Date.now() - new Date(c.updatedAt).getTime() > 10 * 60 * 1000 : true;
                      return (
                        <tr key={c.chain} className="border-b border-white/5 last:border-0">
                          <td className="py-2 pr-3 font-bold text-white">{c.chain}</td>
                          <td className="py-2 pr-3"><Badge tone={live ? 'ok' : 'warn'}>{c.providerMode}</Badge></td>
                          <td className="py-2 pr-3">{c.lastScannedBlock ?? '—'}</td>
                          <td className="py-2 pr-3">{c.safeBlock ?? '—'}</td>
                          <td className="py-2 pr-3 truncate max-w-[140px]" title={c.lastScannedHash ?? ''}>{c.lastScannedHash ? `${c.lastScannedHash.slice(0, 12)}…` : '—'}</td>
                          <td className="py-2 pr-3 text-white/50">{c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString() : '—'}</td>
                          <td className="py-2">
                            {c.lastScannedBlock == null ? <Badge tone="muted">idle</Badge> : stale ? <Badge tone="warn">stale</Badge> : <Badge tone="ok">live</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sc.recentErrors.length > 0 && (
                <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-[11px] text-red-300">
                  {sc.recentErrors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-white/40">{scanner.isLoading ? 'Loading…' : 'Unavailable.'}</p>
          )}
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 5. Operations queue panel */}
          <Panel title="Operations Queues">
            {queues.isError ? (
              <p className="text-xs text-white/40">Requires <code>system.view</code>.</p>
            ) : q ? (
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="INR deposits pending" value={q.pendingInrDeposits} tone={q.pendingInrDeposits > 0 ? 'warn' : 'ok'} />
                <StatTile label="Withdrawals pending" value={q.pendingWithdrawals} tone={q.pendingWithdrawals > 0 ? 'warn' : 'ok'} />
                <StatTile label="Maker-checker deposits" value={q.makerCheckerPendingDeposits} tone={q.makerCheckerPendingDeposits > 0 ? 'warn' : 'ok'} />
                <StatTile label="Maker-checker withdrawals" value={q.makerCheckerPendingWithdrawals} tone={q.makerCheckerPendingWithdrawals > 0 ? 'warn' : 'ok'} />
                <StatTile label="KYC pending" value={q.kycPending} tone={q.kycPending > 0 ? 'warn' : 'ok'} />
                <StatTile label="KYC needs more info" value={q.kycNeedsMoreInfo} tone={q.kycNeedsMoreInfo > 0 ? 'warn' : 'muted'} />
              </div>
            ) : (
              <p className="text-xs text-white/40">{queues.isLoading ? 'Loading…' : 'Unavailable.'}</p>
            )}
          </Panel>

          {/* 6. Risk alerts */}
          <Panel title="Risk Alerts">
            {risk.isError ? (
              <p className="text-xs text-white/40">Requires <code>system.risk.view</code>.</p>
            ) : rk ? (
              <div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <StatTile label="High-risk users" value={rk.highRiskUsers} tone={rk.highRiskUsers > 0 ? 'warn' : 'ok'} />
                  <StatTile label="Frozen users" value={rk.frozenUsers} tone={rk.frozenUsers > 0 ? 'bad' : 'ok'} />
                  <StatTile label="Withdrawals blocked" value={rk.withdrawalsBlockedUsers} tone={rk.withdrawalsBlockedUsers > 0 ? 'warn' : 'ok'} />
                </div>
                <KV
                  label={`Large pending withdrawals (≥ ${rk.largePendingWithdrawals.thresholdUsdt} USDT)`}
                  value={<span className={rk.largePendingWithdrawals.count > 0 ? 'text-amber-300' : 'text-emerald-400'}>{rk.largePendingWithdrawals.count}</span>}
                />
                <KV label={`Failed/rejected withdrawals (${rk.windowHours}h)`} value={rk.failedRejectedWithdrawals} />
                <KV label="Deposits pending too long" value={rk.depositApprovalsPendingTooLong} />
                <KV label="KYC pending too long" value={rk.kycPendingTooLong} />
                <KV label={`Repeated mail failures (${rk.windowHours}h)`} value={<span className={rk.repeatedMailFailures > 0 ? 'text-red-400' : 'text-emerald-400'}>{rk.repeatedMailFailures}</span>} />
                <KV label={`Failed logins (${rk.windowHours}h)`} value={rk.failedLogins} />
                {rk.largePendingWithdrawals.items.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {rk.largePendingWithdrawals.items.slice(0, 5).map((w) => (
                      <div key={w.id} className="flex justify-between gap-2 text-[11px] font-mono text-white/60">
                        <span>{w.asset}/{w.chain}</span>
                        <span className="text-amber-300">{w.amount}</span>
                        <span className="text-white/30">{w.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-white/40">{risk.isLoading ? 'Loading…' : 'Unavailable.'}</p>
            )}
          </Panel>
        </div>

        {/* ===== Stage 10 — Production Go-Live Readiness ===== */}
        <section className="relative rounded-2xl border border-gold/15 bg-gold/[0.02] p-5">
          <div className="mb-4 flex flex-col gap-2 border-b border-white/5 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                Production Go-Live Readiness
                {gl && <Badge tone={goLiveTone(gl.status)}>{gl.status}</Badge>}
              </h2>
              <p className="mt-1 text-[11px] text-white/45">
                Environment separation, domain/SSL, email/SMS, backups, monitoring, security perimeter & secrets.
                Read-only · config-driven · no secrets exposed.
              </p>
            </div>
            {gl && (
              <div className="flex flex-wrap gap-2 text-[11px] text-white/50">
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Env: <b className="text-white/80">{gl.environment}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">APP_ENV: <b className="text-white/80">{gl.appEnv ?? '—'}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Target: <Badge tone={gl.targetingProduction ? 'bad' : 'muted'}>{gl.targetingProduction ? 'production' : 'staging'}</Badge></span>
              </div>
            )}
          </div>

          {goLive.isError ? (
            <p className="text-xs text-white/40">Requires <code>operations.view</code> or <code>system.view</code>.</p>
          ) : gl ? (
            <>
              {!gl.targetingProduction && (
                <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300">
                  APP_ENV is not <b>production</b> — production gaps below are shown as <b>warnings</b>. Set APP_ENV=production to evaluate them as launch blockers.
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {gl.sections.map((s) => (
                  <div key={s.key} className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
                    <div className="mb-2 flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">{s.title}</span>
                      <Badge tone={goLiveTone(s.status)}>{s.status}</Badge>
                    </div>
                    <div className="space-y-1">
                      {s.checks.map((c) => (
                        <div key={c.key} className="flex items-start justify-between gap-2 py-1">
                          <div className="min-w-0">
                            <span className="block text-[11px] font-medium text-white/75">{c.label}</span>
                            <span className="block text-[10px] text-white/35">{c.detail}</span>
                          </div>
                          <Badge tone={goLiveCheckTone(c.status)}>{c.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Blockers / warnings rollup */}
              {gl.warnings.length > 0 && (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.01] p-3">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/40">Outstanding items</span>
                  <div className="space-y-0.5">
                    {gl.warnings.slice(0, 30).map((w, i) => (
                      <div key={i} className={`text-[11px] ${w.startsWith('[BLOCKER]') ? 'text-red-400' : 'text-amber-300'}`}>{w}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===== Stage 10H — Final Go-Live Checklist ===== */}
              <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.01] p-4">
                <span className="mb-3 block text-[11px] font-bold uppercase tracking-wider text-white/80">
                  Go-Live Checklist
                  <span className="ml-2 font-mono text-white/40">
                    {gl.checklist.filter((c) => c.done).length}/{gl.checklist.length}
                  </span>
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {gl.checklist.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2">
                      <span className="text-[11px] text-white/70">{c.label}</span>
                      <Badge tone={c.done ? 'ok' : 'muted'}>{c.done ? 'done' : 'pending'}</Badge>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] text-white/30">
                  Items show <b className="text-emerald-400">done</b> only when an operator has explicitly set the corresponding GOLIVE_* flag — there is no automatic completion.
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-white/40">{goLive.isLoading ? 'Loading…' : 'Unavailable.'}</p>
          )}
        </section>

        {/* ===== Stage 9A — Structured Readiness ===== */}
        <Panel title="Readiness Checks (Stage 9)" action={rd && <Badge tone={readyTone(rd.status)}>{rd.status}</Badge>}>
          {readiness.isError ? (
            <p className="text-xs text-white/40">Requires <code>operations.view</code> or <code>system.view</code>.</p>
          ) : rd ? (
            <>
              <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {rd.checks.map((c) => (
                  <div key={c.key} className="rounded-xl border border-white/5 bg-white/[0.01] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-white/70">{c.label}</span>
                      <Badge tone={checkTone(c.status)}>{c.status}</Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-white/40">{c.detail}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-white/50">
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Version: <b className="text-white/80">{rd.version}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Env: <b className="text-white/80">{rd.environment}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Commit: <b className="text-white/80">{rd.build.commit ?? '—'}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Checked: <b className="text-white/80">{new Date(rd.timestamp).toLocaleTimeString()}</b></span>
              </div>
            </>
          ) : (
            <p className="text-xs text-white/40">{readiness.isLoading ? 'Loading…' : 'Unavailable.'}</p>
          )}
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ===== Stage 9B — Backup & Restore ===== */}
          <Panel title="Backup & Restore" action={bk && <Badge tone={bk.status === 'ok' ? 'ok' : 'warn'}>{bk.status}</Badge>}>
            {backup.isError ? (
              <p className="text-xs text-white/40">Requires <code>operations.view</code> or <code>system.view</code>.</p>
            ) : bk ? (
              <>
                <KV label="Provider" value={bk.database.provider} />
                <KV
                  label="Automated backups"
                  value={<Badge tone={bk.database.automatedBackups === 'enabled' ? 'ok' : bk.database.automatedBackups === 'disabled' ? 'bad' : 'warn'}>{bk.database.automatedBackups}</Badge>}
                />
                <KV label="Retention" value={bk.database.retentionDays !== null ? `${bk.database.retentionDays}d` : '—'} />
                <KV label="Latest snapshot" value={bk.latestBackup.known ? `${bk.latestBackup.snapshotId}` : 'unknown'} />
                <KV label="Restore drill" value={bk.restoreDrill.documented ? new Date(bk.restoreDrill.lastTestedAt as string).toLocaleDateString() : 'not documented'} />
                <div className="mt-3 space-y-1.5">
                  {[...bk.backupChecklist, ...bk.restoreDrillChecklist].map((i) => (
                    <div key={i.key} className="flex items-start justify-between gap-2">
                      <span className="text-[11px] text-white/60">{i.label}</span>
                      <Badge tone={backupItemTone(i.status)}>{i.status === 'action_required' ? 'action' : i.status}</Badge>
                    </div>
                  ))}
                </div>
                {bk.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300">
                    {bk.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-white/40">{backup.isLoading ? 'Loading…' : 'Unavailable.'}</p>
            )}
          </Panel>

          {/* ===== Stage 9C — Monitoring & Alerts ===== */}
          <Panel
            title="Monitoring & Alerts"
            action={mon && <Badge tone={mon.status === 'ok' ? 'ok' : 'warn'}>{mon.configuredCount}/{mon.totalCount}</Badge>}
          >
            {monitoring.isError ? (
              <p className="text-xs text-white/40">Requires <code>operations.view</code> or <code>system.view</code>.</p>
            ) : mon ? (
              <div className="space-y-1.5">
                {mon.alerts.map((al) => (
                  <div key={al.key} className="rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-white/75">{al.label}</span>
                      <Badge tone={al.configured ? 'ok' : 'warn'}>{al.configured ? 'configured' : 'missing'}</Badge>
                    </div>
                    <p className="mt-0.5 text-[10px] text-white/35">Recommended: {al.recommendedThreshold}</p>
                  </div>
                ))}
                {mon.dashboardUrl && (
                  <a href={mon.dashboardUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-gold hover:underline">
                    Open monitoring dashboard →
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-white/40">{monitoring.isLoading ? 'Loading…' : 'Unavailable.'}</p>
            )}
          </Panel>
        </div>

        {/* ===== Stage 9E — Security Guardrails ===== */}
        <Panel
          title="Security Guardrails"
          action={gr && <Badge tone="muted">{gr.enforcedCount} enforced · {gr.plannedCount} planned</Badge>}
        >
          {guardrails.isError ? (
            <p className="text-xs text-white/40">Requires <code>operations.view</code> or <code>system.view</code>.</p>
          ) : gr ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {gr.guardrails.map((g) => (
                <div key={g.key} className="rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-white/75">{g.label}</span>
                    <Badge tone={guardrailTone(g.state)}>{g.state}</Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-white/35">{g.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/40">{guardrails.isLoading ? 'Loading…' : 'Unavailable.'}</p>
          )}
          <p className="mt-3 text-[10px] text-white/30">
            <b className="text-emerald-400">enforced</b> = active today · <b className="text-amber-300">partial</b> = available but not fully on · <b className="text-white/50">planned</b> = documented, needs model support.
          </p>
        </Panel>

        {/* Compliance feature mode (Stage 15) */}
        <Panel title="Compliance Mode">
          {o ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-md px-3 py-1 text-xs font-black uppercase tracking-wider ${
                    o.compliance.mode === 'INR_ONLY'
                      ? 'border border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  Current mode: {o.compliance.mode}
                </span>
                <span className="text-[11px] text-white/50">{o.compliance.reason}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FlagRow label="Crypto deposits (global)" value={o.compliance.cryptoDepositsGloballyEnabled ? 'ENABLED' : 'disabled'} tone={o.compliance.cryptoDepositsGloballyEnabled ? 'warn' : 'ok'} />
                <FlagRow label="Crypto withdrawals (global)" value={o.compliance.cryptoWithdrawalsGloballyEnabled ? 'ENABLED' : 'disabled'} tone={o.compliance.cryptoWithdrawalsGloballyEnabled ? 'warn' : 'ok'} />
                <FlagRow label="Crypto wallet (global)" value={o.compliance.cryptoWalletGloballyEnabled ? 'ENABLED' : 'disabled'} tone={o.compliance.cryptoWalletGloballyEnabled ? 'warn' : 'ok'} />
                <FlagRow label="INR deposits (global)" value={o.compliance.inrDepositsGloballyEnabled ? 'enabled' : 'DISABLED'} tone={o.compliance.inrDepositsGloballyEnabled ? 'ok' : 'bad'} />
                <FlagRow label="INR withdrawals (global)" value={o.compliance.inrWithdrawalsGloballyEnabled ? 'enabled' : 'DISABLED'} tone={o.compliance.inrWithdrawalsGloballyEnabled ? 'ok' : 'bad'} />
                <FlagRow label="Trading (global)" value={o.compliance.tradingGloballyEnabled ? 'enabled' : 'DISABLED'} tone={o.compliance.tradingGloballyEnabled ? 'ok' : 'bad'} />
              </div>
              <p className="mt-3 text-[10px] text-white/30">
                Global flags sit above per-user feature controls — effective access is
                global AND per-user. Crypto stays disabled for all users until these
                global flags are turned on (FIU/compliance pending).
              </p>
            </>
          ) : (
            <p className="text-xs text-white/40">{overview.isLoading ? 'Loading…' : 'Unavailable.'}</p>
          )}
        </Panel>

        {/* 7. Deployment safety panel */}
        <Panel title="Deployment / Safety Flags">
          {o ? (
            <>
              <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-white/50">
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Version: <b className="text-white/80">{o.deployment.version}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Env: <b className="text-white/80">{o.deployment.environment}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">API prefix: <b className="text-white/80">{o.deployment.apiPrefix}</b></span>
                <span className="rounded border border-white/10 bg-white/[0.02] px-2 py-1">Admin prefix: <b className="text-white/80">{o.deployment.adminApiPrefix}</b></span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <FlagRow label="Mail provider" value={o.flags.mailProvider.toUpperCase()} tone={o.flags.mailProvider === 'ses' ? 'ok' : 'warn'} />
                <FlagRow label="Withdrawal signer" value={o.flags.withdrawalSigner} tone={o.flags.withdrawalSigner === 'mock' ? 'warn' : 'ok'} />
                <FlagRow label="Live signing" value={o.flags.liveSigningEnabled ? 'ENABLED' : 'disabled'} tone={o.flags.liveSigningEnabled ? 'bad' : 'ok'} />
                <FlagRow label="Admin TOTP required" value={o.flags.adminTotpRequired ? 'yes' : 'NO'} tone={o.flags.adminTotpRequired ? 'ok' : 'bad'} />
                <FlagRow label="Mock providers allowed" value={o.flags.mockProvidersAllowed ? 'YES' : 'no'} tone={o.flags.mockProvidersAllowed ? 'warn' : 'ok'} />
                <FlagRow label="Mock signer allowed" value={o.flags.mockWithdrawalSignerAllowed ? 'YES' : 'no'} tone={o.flags.mockWithdrawalSignerAllowed ? 'warn' : 'ok'} />
                <FlagRow label="Log mail allowed" value={o.flags.logMailProviderAllowed ? 'YES' : 'no'} tone={o.flags.logMailProviderAllowed ? 'warn' : 'ok'} />
                <FlagRow label="Unverified login allowed" value={o.flags.unverifiedEmailLoginAllowed ? 'YES' : 'no'} tone={o.flags.unverifiedEmailLoginAllowed ? 'warn' : 'ok'} />
                <FlagRow label="Email verification bypass (testing)" value={o.flags.unverifiedLoginAllowed ? 'YES' : 'no'} tone={o.flags.unverifiedLoginAllowed ? 'bad' : 'ok'} />
              </div>
              <p className="mt-3 text-[10px] text-white/30">
                Amber/red flags indicate staging/demo posture or reduced safety. None of these expose secrets.
              </p>
            </>
          ) : (
            <p className="text-xs text-white/40">{overview.isLoading ? 'Loading…' : 'Unavailable.'}</p>
          )}
        </Panel>

        <div className="text-center text-[10px] text-white/20 pt-2">
          Exora · System observability · operational data only — no secrets exposed.
        </div>
      </main>
    </div>
  );
}

function FlagRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2">
      <span className="text-[11px] text-white/50">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}
