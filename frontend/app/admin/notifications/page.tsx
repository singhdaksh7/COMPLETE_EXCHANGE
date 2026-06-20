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

function EmailStatusBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    SENT: 'bg-up/15 text-up',
    LOGGED: 'bg-sky-500/15 text-sky-400',
    SKIPPED: 'bg-white/10 text-white/50',
    FAILED: 'bg-down/15 text-down',
  };
  const cls = status ? map[status] ?? 'bg-white/10 text-white/50' : 'bg-white/10 text-white/40';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{status ?? '—'}</span>;
}

export default function AdminNotificationsPage() {
  const ready = useGuard('admin');
  const q = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => adminApi.notifications(),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const items = q.data?.data.items ?? [];

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

      <main className="relative z-10 mx-auto max-w-[1200px] px-6 pt-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Notification Delivery Log</h1>
            <p className="text-xs text-white/50 mt-1">Recent user notifications and their email delivery status. Read-only.</p>
          </div>
          <button
            onClick={() => q.refetch()}
            className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider"
          >
            Refresh
          </button>
        </div>

        {q.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
            {errorMessage(q.error)} — notifications.view permission is required.
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          {q.isLoading ? (
            <p className="text-sm text-white/40 py-8 text-center">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-white/40 py-10 text-center">No notifications have been generated yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-white/40 text-[10px] uppercase tracking-wider">
                  <th className="py-2 pr-2 font-semibold">Time</th>
                  <th className="pr-2 font-semibold">User</th>
                  <th className="pr-2 font-semibold">Type</th>
                  <th className="pr-2 font-semibold">Title</th>
                  <th className="pr-2 font-semibold">Email</th>
                  <th className="font-semibold">Read</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((n) => (
                  <tr key={n.id}>
                    <td className="py-2.5 pr-2 text-white/55 font-mono text-[11px]">{new Date(n.createdAt).toLocaleString()}</td>
                    <td className="pr-2 text-white/70 truncate max-w-[180px]">{n.email}</td>
                    <td className="pr-2 font-mono text-[11px] text-white/70">{n.type}</td>
                    <td className="pr-2 text-white/80">{n.title}</td>
                    <td className="pr-2"><EmailStatusBadge status={n.emailStatus} /></td>
                    <td className="text-white/50 text-xs">{n.read ? 'read' : 'unread'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
