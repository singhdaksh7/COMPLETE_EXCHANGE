'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[350px] w-[350px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
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

  if (!ready) return null;
  const me = q.data?.data;

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-20">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #111114 !important; border-bottom: 1px solid rgba(245,194,66,0.15) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <AdminNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-2xl px-5 pt-8">
        <div className="mb-6 flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Admin Command Center</h1>
            <p className="text-xs text-white/50 mt-1">Audit administrative operations, scanners, and KYC approvals.</p>
          </div>
        </div>

        {q.isLoading && <p className="text-sm text-white/40">Opening dashboard...</p>}
        {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}

        {me && (
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-7 shadow-gold-soft backdrop-blur-2xl">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
            
            <div className="relative space-y-4 text-sm">
              <div className="flex justify-between border-b border-white/5 pb-2.5">
                <span className="text-white/45">Admin Email</span>
                <span className="font-semibold text-ink">{me.admin.email}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2.5">
                <span className="text-white/45">Access Status</span>
                <span className="font-semibold text-gold">{me.admin.status}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2.5">
                <span className="text-white/45">Roles Granted</span>
                <span className="font-semibold text-ink">{me.roles.join(', ') || '—'}</span>
              </div>
              <div className="flex justify-between pb-1.5">
                <span className="text-white/45">Permissions List</span>
                <span className="font-semibold text-ink max-w-[280px] text-right truncate" title={me.permissions.join(', ')}>
                  {me.permissions.join(', ') || '—'}
                </span>
              </div>

              <div className="border-t border-white/5 pt-6 mt-4">
                <h3 className="text-xs font-bold text-gold uppercase tracking-wider mb-4">Command Desks</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/admin/kyc" className="flex items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-glow py-3 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition text-center">
                    KYC Manual Review
                  </Link>
                  <Link href="/admin/withdrawals" className="flex items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.02] py-3 text-xs font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition text-center">
                    Withdrawal Queue
                  </Link>
                  <Link href="/admin/deposits" className="flex items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.02] py-3 text-xs font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition text-center">
                    INR Deposit Logs
                  </Link>
                  <Link href="/admin/scanner" className="flex items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.02] py-3 text-xs font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition text-center">
                    Scanner Status
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
