'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function AdminCompliancePage() {
  const ready = useGuard('admin');
  const q = useQuery({
    queryKey: ['admin-compliance-summary'],
    queryFn: () => adminApi.complianceSummary(),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const s = q.data?.data;

  const metricCards = s
    ? [
        { label: 'Pending review', val: s.counts.pending, icon: '🕗' },
        { label: 'In review', val: s.counts.inReview, icon: '🔍' },
        { label: 'Manual review', val: s.counts.manualReview, icon: '🧑‍⚖️' },
        { label: 'Needs more info', val: s.counts.needsMoreInfo, icon: '✉️' },
        { label: 'Approved', val: s.counts.approved, icon: '✅' },
        { label: 'Rejected', val: s.counts.rejected, icon: '⛔' },
        { label: 'Pending > 24h', val: s.pendingOver24h, icon: '⚠️' },
        { label: 'Pending > 48h', val: s.pendingOver48h, icon: '🚨' },
        { label: 'High-risk users', val: s.highRiskUsers, icon: '🔥' },
        { label: 'Rejection rate', val: s.rejectionRatePct === null ? '—' : `${s.rejectionRatePct}%`, icon: '📉' },
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
      <AdminNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-[1300px] px-6 pt-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Compliance Dashboard</h1>
            <p className="text-xs text-white/50 mt-1">Real KYC and risk metrics across all users. No sample data.</p>
          </div>
          <a href="/admin/kyc" className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider">
            Open KYC queue →
          </a>
        </div>

        {q.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
            {errorMessage(q.error)} — compliance.view permission is required.
          </div>
        )}
        {q.isLoading && <p className="text-sm text-white/40">Loading compliance metrics…</p>}

        {s && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {metricCards.map((m) => (
                <div key={m.label} className="relative rounded-xl border border-white/5 bg-white/[0.01] p-4 min-h-[96px] flex flex-col justify-between overflow-hidden">
                  <div className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-b from-gold/5 to-transparent opacity-25" />
                  <div className="relative z-10 flex justify-between items-center">
                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">{m.label}</span>
                    <span className="text-xs">{m.icon}</span>
                  </div>
                  <span className="relative z-10 text-2xl font-black text-white font-mono leading-tight">{m.val}</span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Recent KYC actions</h3>
                <a href="/admin/kyc" className="text-[10px] text-gold hover:underline">Review queue →</a>
              </div>
              {s.recentActions.length === 0 ? (
                <p className="text-xs text-white/35 py-6 text-center">No KYC admin actions recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {s.recentActions.map((a) => (
                    <div key={a.id} className="flex justify-between items-center gap-3 text-[11px] border-b border-white/5 pb-1.5 last:border-0">
                      <span className="font-mono text-white/80 w-32 shrink-0">{a.action}</span>
                      <span className="text-white/45 font-mono truncate flex-1">{a.actorEmail ?? a.actorAdminId.slice(0, 8)}</span>
                      {a.reason && <span className="text-white/40 truncate max-w-[260px] hidden md:block">“{a.reason}”</span>}
                      <span className="text-white/30 shrink-0">{new Date(a.occurredAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
