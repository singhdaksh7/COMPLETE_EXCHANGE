'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function AdminDashboardPage() {
  const ready = useGuard('admin');
  const q = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me(),
    enabled: ready,
  });
  const ops = useQuery({
    queryKey: ['admin-ops-summary'],
    queryFn: () => adminApi.operationsSummary(),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const me = q.data?.data;
  const s = ops.data?.data;

  // REAL operational counts from the backend (operations.view).
  const realMetrics = s
    ? [
        { title: 'Pending INR Deposits', val: String(s.inrDeposits.pending), icon: '🕗' },
        { title: 'Approved INR Deposits', val: String(s.inrDeposits.approved), icon: '✅' },
        { title: 'Rejected INR Deposits', val: String(s.inrDeposits.rejected), icon: '❌' },
        { title: 'Pending Withdrawal Total', val: `${s.withdrawals.pendingTotal} USDT`, icon: '⏳' },
        { title: 'Completed Withdrawal Total', val: `${s.withdrawals.completedTotal} USDT`, icon: '✅' },
        { title: 'Failed / Rejected Withdrawals', val: String(s.withdrawals.failedRejectedCount), icon: '⛔' },
        { title: 'Pending KYC Reviews', val: String(s.kyc.pending), icon: '📝' },
        { title: 'Active Admins', val: String(s.admins.active), icon: '🛡️' },
        { title: 'Suspended Admins', val: String(s.admins.suspended), icon: '⛔' },
      ]
    : [];

  const recentAdminActions = s?.recentAdminActions ?? [];

  return (
    <div className="relative min-h-screen w-full min-w-0 bg-noir font-sans text-white pb-10">
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-[1500px] px-6 pt-6 space-y-6">
        
        {/* Top Header Row */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Admin Dashboard
            </h1>
            <p className="text-xs text-white/50 mt-1 flex items-center gap-1.5">
              Welcome back, Super Admin <span className="h-4 w-4 rounded-full bg-gold/20 border border-gold/50 flex items-center justify-center text-[9px] text-gold font-bold">✓</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live counts reflect all-time data from the backend. */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-mono text-white/70 flex items-center gap-2">
              <span>📊</span>
              <span>Live operational counts</span>
            </div>
          </div>
        </div>

        {q.isLoading && <p className="text-sm text-white/40">Opening dashboard...</p>}
        {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}

        {/* Dashboard statistics contents */}
        {me && (
          <div className="space-y-6">

            {/* REAL operational metrics (live from the backend). */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-up">● Live operations</span>
                {ops.isError && (
                  <span className="text-[10px] text-white/40">
                    (operations.view permission required for live counts)
                  </span>
                )}
              </div>
              {s ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {realMetrics.map((item, i) => (
                    <div key={i} className="relative rounded-xl border border-white/5 bg-white/[0.01] p-4 flex flex-col justify-between min-h-[100px] overflow-hidden">
                      <div className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-b from-gold/5 to-transparent opacity-25" />
                      <div className="relative z-10 flex justify-between items-center mb-1">
                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">{item.title}</span>
                        <span className="text-xs">{item.icon}</span>
                      </div>
                      <div className="relative z-10">
                        <span className="text-2xl font-black text-white font-mono block leading-tight">{item.val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40">
                  {ops.isLoading ? 'Loading live counts…' : 'Live counts unavailable.'}
                </p>
              )}
            </div>

            {/* Recent admin actions (REAL — from AdminLog). */}
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Recent admin actions (live)</span>
                <a href="/admin/audit" className="text-[10px] text-gold hover:underline">View audit log →</a>
              </div>
              {recentAdminActions.length > 0 ? (
                <div className="space-y-1">
                  {recentAdminActions.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex justify-between gap-2 text-[11px] text-white/70">
                      <span className="font-mono">{a.action}</span>
                      <span className="font-mono text-white/40 truncate">{a.actorEmail ?? a.actorAdminId.slice(0, 8)}</span>
                      <span className="text-white/30 shrink-0">{new Date(a.occurredAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40">No recent activity yet.</p>
              )}
            </div>

            {/* Asset-wise pending withdrawal exposure (REAL). */}
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Asset-wise pending withdrawal exposure</span>
                <a href="/admin/withdrawals" className="text-[10px] text-gold hover:underline">Review queue →</a>
              </div>
              {s && s.withdrawals.pendingByAsset.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {s.withdrawals.pendingByAsset.map((row) => (
                    <span key={row.asset} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-mono text-white/75">
                      {row.asset}: {row.amount}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40">No trading data yet.</p>
              )}
            </div>

            {/* Admin identity details (preserving session diagnostics) */}
            <div className="rounded-xl border border-gold/15 bg-gold/5 p-4 text-xs flex flex-wrap justify-between items-center gap-3">
              <div>
                <span className="font-bold text-gold block">Signed-in admin</span>
                <span className="text-white/60 text-[10px] mt-0.5 block">Signed in as {me.admin.email} (Status: {me.admin.status})</span>
              </div>
              <div className="flex gap-4 font-mono text-[10px] text-white/45">
                <span>Roles: <strong>{me.roles.join(', ') || '—'}</strong></span>
                <span>ID: <strong>{me.admin.id.slice(0, 8)}</strong></span>
              </div>
            </div>

            {/* Analytics Rows Grid — empty states until live analytics are wired. */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Left Analytics Column (8 cols) */}
              <div className="lg:col-span-8 space-y-6">

                {/* Trading & Users overview — no live data yet */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
                    <span className="text-[10px] font-bold text-white/45 uppercase tracking-widest block">Trading Volume</span>
                    <div className="flex h-44 w-full items-center justify-center">
                      <p className="text-xs text-white/40">No trading data yet.</p>
                    </div>
                  </div>

                  <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
                    <span className="text-[10px] font-bold text-white/45 uppercase tracking-widest block">Revenue Overview</span>
                    <div className="flex h-44 w-full items-center justify-center">
                      <p className="text-xs text-white/40">No trading data yet.</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Users Overview</h3>
                    <div className="flex h-28 w-full items-center justify-center">
                      <p className="text-xs text-white/40">No users found.</p>
                    </div>
                  </div>

                  <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Deposits vs Withdrawals</h3>
                    <div className="flex h-28 w-full items-center justify-center">
                      <p className="text-xs text-white/40">No trading data yet.</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Columns: Alerts & Activities (4 cols) */}
              <div className="lg:col-span-4 space-y-6">

                {/* System Alerts */}
                <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">System Alerts</h3>
                  </div>
                  <p className="text-xs text-white/40">No alerts found.</p>
                </div>

                {/* Recent Activities */}
                <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Recent Activities</h3>
                  </div>
                  <p className="text-xs text-white/40">No recent activity yet.</p>
                </div>

              </div>
            </div>

            {/* Footer rights */}
            <div className="text-center text-[10px] text-white/20 pt-4 font-sans flex flex-col sm:flex-row justify-between items-center gap-2 border-t border-white/5 mt-6">
              <span>© 2025 Exora India Pvt. Ltd. All rights reserved.</span>
              <div className="flex gap-4 font-semibold uppercase tracking-wider">
                <span>🛡️ Secure</span>
                <span>• Reliable</span>
                <span>• Transparent</span>
              </div>
              <span>Version 2.1.0</span>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
