'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import type { AdminOpsNotification } from '@/lib/types';

function fmt(d: string): string {
  return new Date(d).toLocaleString();
}

function SeverityDot({ severity }: { severity: string }) {
  const cls =
    severity === 'CRITICAL' ? 'bg-red-400' : severity === 'WARNING' ? 'bg-gold' : 'bg-white/40';
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

/** Deep-link a notification to the most relevant admin page by target type. */
function targetHref(n: AdminOpsNotification): string | null {
  if (!n.targetId) return null;
  switch (n.targetType) {
    case 'user':
      return `/admin/users/detail?id=${n.targetId}`;
    case 'compliance_case':
      return `/admin/compliance/cases/detail?id=${n.targetId}`;
    case 'inr_transaction':
      return '/admin/deposits';
    case 'crypto_withdrawal':
      return '/admin/withdrawals';
    case 'wallet_risk_check':
      return '/admin/compliance/wallet-risk';
    case 'screening_check':
      return '/admin/compliance/users';
    default:
      return null;
  }
}

export default function NotificationCenterPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const q = useQuery({
    queryKey: ['admin-notification-center', unreadOnly],
    queryFn: () => adminApi.adminNotifications({ unreadOnly }),
    enabled: ready,
    retry: false,
    refetchInterval: 60000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-notification-center'] });
  const markRead = useMutation({
    mutationFn: (id: string) => adminApi.adminNotificationMarkRead(id),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => adminApi.adminNotificationMarkAllRead(),
    onSuccess: invalidate,
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

      <main className="relative z-10 mx-auto max-w-[900px] px-6 pt-6 space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Notification Center</h1>
            <p className="text-xs text-white/50 mt-1">
              Operational notifications derived from real exchange state.
              {d ? <span className="ml-1 text-gold">{d.unread} unread</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
                unreadOnly ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/10 bg-white/[0.02] text-white/60 hover:text-white'
              }`}
            >
              {unreadOnly ? 'Showing unread' : 'Show all'}
            </button>
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || (d?.unread ?? 0) === 0}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-gold transition disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
        </div>

        {q.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
            {errorMessage(q.error)} — operations.view permission is required.
          </div>
        )}
        {q.isLoading && <p className="text-sm text-white/40">Loading notifications…</p>}

        {d && (
          d.items.length === 0 ? (
            <p className="py-16 text-center text-sm text-white/35">
              {unreadOnly ? 'No unread notifications.' : 'No notifications. Operational alerts will appear here.'}
            </p>
          ) : (
            <div className="space-y-2">
              {d.items.map((n) => {
                const href = targetHref(n);
                return (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-4 transition ${
                      n.isRead ? 'border-white/5 bg-white/[0.01]' : 'border-gold/15 bg-gold/[0.03]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="mt-1.5"><SeverityDot severity={n.severity} /></span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{n.title}</span>
                            {!n.isRead && <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[8px] font-bold text-gold uppercase">New</span>}
                          </div>
                          <p className="text-xs text-white/60 mt-0.5">{n.message}</p>
                          <div className="mt-1 flex items-center gap-3 text-[10px] text-white/30">
                            <span className="font-mono">{n.type}</span>
                            <span>{fmt(n.createdAt)}</span>
                            {href && <a href={href} className="text-gold hover:underline">Open →</a>}
                          </div>
                        </div>
                      </div>
                      {!n.isRead && (
                        <button
                          onClick={() => markRead.mutate(n.id)}
                          disabled={markRead.isPending}
                          className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-bold text-white/60 hover:text-gold transition"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>
    </div>
  );
}
