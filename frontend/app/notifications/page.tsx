'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { Notification, NotificationType } from '@/lib/types';

const ICONS: Record<NotificationType, string> = {
  KYC_APPROVED: '✅',
  KYC_REJECTED: '⛔',
  KYC_NEEDS_MORE_INFO: '✉️',
  INR_DEPOSIT_SUBMITTED: '🧾',
  INR_DEPOSIT_APPROVED: '💰',
  INR_DEPOSIT_REJECTED: '⚠️',
  WITHDRAWAL_REQUESTED: '🏧',
  WITHDRAWAL_APPROVED: '✅',
  WITHDRAWAL_REJECTED: '⚠️',
  WITHDRAWAL_COMPLETED: '🎉',
  INR_WITHDRAWAL_PAID: '🏦',
  PASSWORD_CHANGED: '🔒',
  SECURITY_SESSION_REVOKED: '🛡️',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => userApi.listNotifications(),
    enabled: ready,
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => userApi.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => userApi.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = useMemo<Notification[]>(() => q.data?.data.items ?? [], [q.data]);
  const unread = q.data?.data.unread ?? 0;

  if (!ready) return null;

  return (
    <UserShell className="max-w-[900px] space-y-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Notifications
            {unread > 0 && (
              <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-black text-noir">{unread} new</span>
            )}
          </h1>
          <p className="text-[10px] text-white/45 tracking-wide uppercase mt-1">
            Account, KYC, deposit, withdrawal and security alerts
          </p>
        </div>
        <button
          onClick={() => markAll.mutate()}
          disabled={unread === 0 || markAll.isPending}
          className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition disabled:opacity-40 uppercase tracking-wider"
        >
          Mark all read
        </button>
      </div>

      {q.isError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
          {errorMessage(q.error)}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
        {q.isLoading ? (
          <p className="text-sm text-white/40 py-10 text-center">Loading notifications…</p>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-2">🔔</div>
            <p className="text-sm text-white/50">You&rsquo;re all caught up.</p>
            <p className="text-xs text-white/30 mt-1">Account and transaction alerts will appear here.</p>
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-4 transition ${n.read ? 'opacity-70' : 'bg-gold/[0.03]'}`}
            >
              <span className="text-lg shrink-0 mt-0.5">{ICONS[n.type] ?? '🔔'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-gold shrink-0" />}
                  <span className="font-bold text-sm text-white">{n.title}</span>
                </div>
                <p className="text-xs text-white/65 mt-0.5 leading-relaxed">{n.message}</p>
                <span className="text-[10px] text-white/30 font-mono mt-1 block">{timeAgo(n.createdAt)}</span>
              </div>
              {!n.read && (
                <button
                  onClick={() => markRead.mutate(n.id)}
                  disabled={markRead.isPending}
                  className="text-[10px] font-bold text-gold hover:underline shrink-0 mt-1 disabled:opacity-40"
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {q.data?.data.nextCursor && (
        <p className="text-center text-[10px] text-white/30">Showing your most recent notifications.</p>
      )}
    </UserShell>
  );
}
