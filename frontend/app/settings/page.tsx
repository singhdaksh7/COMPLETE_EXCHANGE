'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { Notification, NotificationType } from '@/lib/types';

type ActiveTab = 'FEED' | 'SETTINGS';
type NotifFilter = 'ALL' | 'SECURITY' | 'KYC' | 'DEPOSIT' | 'WITHDRAWAL';

/**
 * Stage 7B — this feed now shows ONLY real notifications from the backend
 * (KYC / deposit / withdrawal / security events). There is no mock/placeholder
 * data, no fake device, no fake location, no crypto rows. When there are no
 * real events the feed shows an honest empty state.
 */

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

function categoryOf(type: NotificationType): Exclude<NotifFilter, 'ALL'> | 'OTHER' {
  if (type.startsWith('KYC')) return 'KYC';
  if (type.startsWith('INR_DEPOSIT')) return 'DEPOSIT';
  if (type.startsWith('WITHDRAWAL') || type === 'INR_WITHDRAWAL_PAID') return 'WITHDRAWAL';
  if (type === 'PASSWORD_CHANGED' || type === 'SECURITY_SESSION_REVOKED') return 'SECURITY';
  return 'OTHER';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function SettingsPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('FEED');
  const [filter, setFilter] = useState<NotifFilter>('ALL');

  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => userApi.listNotifications(),
    enabled: ready,
    refetchInterval: 30000,
  });

  const markAll = useMutation({
    mutationFn: () => userApi.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => userApi.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = useMemo<Notification[]>(() => q.data?.data.items ?? [], [q.data]);
  const unread = q.data?.data.unread ?? 0;

  const counts = useMemo(() => {
    const c = { ALL: items.length, SECURITY: 0, KYC: 0, DEPOSIT: 0, WITHDRAWAL: 0 };
    for (const n of items) {
      const cat = categoryOf(n.type);
      if (cat !== 'OTHER') c[cat] += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (filter === 'ALL' ? items : items.filter((n) => categoryOf(n.type) === filter)),
    [items, filter],
  );

  if (!ready) return null;

  return (
    <UserShell className="max-w-[1400px]">
      {/* Tab Switcher */}
      <div className="mb-6 flex gap-2 border-b border-white/5 pb-px">
        <button
          onClick={() => setActiveTab('FEED')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'FEED'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          🔔 Notifications Center
        </button>
        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'SETTINGS'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          ⚙️ Preferences
        </button>
      </div>

      {activeTab === 'FEED' ? (
        <div className="space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Notifications
                {unread > 0 && (
                  <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-black text-noir">
                    {unread} new
                  </span>
                )}
              </h1>
              <p className="text-xs text-white/50 mt-1">
                Real account, KYC, deposit, withdrawal and security events only.
              </p>
            </div>
            <button
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
              className="rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition disabled:opacity-40 uppercase tracking-wider"
            >
              Mark all read
            </button>
          </div>

          {q.isError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
              {errorMessage(q.error)}
            </div>
          )}

          {/* Split Pane Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Filter Card */}
            <div className="lg:col-span-3 space-y-4">
              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">
                  Filters
                </span>
                <div className="space-y-1 text-xs">
                  {[
                    { id: 'ALL', label: 'All Notifications', count: counts.ALL },
                    { id: 'SECURITY', label: 'Security Alerts', count: counts.SECURITY },
                    { id: 'KYC', label: 'KYC Updates', count: counts.KYC },
                    { id: 'DEPOSIT', label: 'Deposit Updates', count: counts.DEPOSIT },
                    { id: 'WITHDRAWAL', label: 'Withdrawal Updates', count: counts.WITHDRAWAL },
                  ].map((cat) => {
                    const active = filter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setFilter(cat.id as NotifFilter)}
                        className={`w-full flex justify-between items-center px-3 py-2.5 rounded-lg font-bold text-left transition-all ${
                          active
                            ? 'bg-gold/10 text-gold font-bold border border-gold/20'
                            : 'text-white/50 hover:text-white hover:bg-white/[0.02]'
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono ${
                            active ? 'bg-gold text-noir' : 'bg-white/5 text-white/40'
                          }`}
                        >
                          {cat.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Notification Feed */}
            <div className="lg:col-span-9 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
              {q.isLoading ? (
                <p className="text-xs text-white/40 py-12 text-center">Loading…</p>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-3xl mb-2">🔔</div>
                  <p className="text-sm text-white/50">No alerts yet.</p>
                  <p className="text-xs text-white/30 mt-1">
                    Account and transaction alerts will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filtered.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-xl border p-4 flex gap-4 transition items-start relative ${
                        n.read ? 'border-white/5 bg-white/[0.01]' : 'border-gold/20 bg-gold/5'
                      }`}
                    >
                      <div className="h-9 w-9 rounded-full bg-noir-2 border border-white/5 flex items-center justify-center text-sm shrink-0">
                        {ICONS[n.type] ?? '🔔'}
                      </div>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">{n.title}</span>
                          {!n.read && (
                            <span className="text-[8px] font-extrabold bg-gold/15 text-gold px-1.5 py-0.5 rounded uppercase">
                              New
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/50 leading-relaxed mt-1">{n.message}</p>
                        <span className="text-[9px] text-white/30 font-mono mt-1 block">
                          {fmt(n.createdAt)}
                        </span>
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
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Preferences tab — UI preferences only (no fake alert/security data). */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">
              User Interface Preferences
            </h3>
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/45 uppercase">
                  Default Base Currency
                </label>
                <select className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none">
                  <option>INR (Indian Rupee)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/45 uppercase">
                  Layout density
                </label>
                <select className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none">
                  <option>Standard spacing (Default)</option>
                  <option>Compact grid layout</option>
                </select>
              </div>
              <p className="text-[10px] text-white/30">
                Interface preferences are local only and do not change your security settings.
              </p>
            </div>
          </div>

          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">
              Notification Channels
            </h3>
            <div className="space-y-3.5 text-xs text-white/70">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded border-white/10 bg-noir text-gold accent-gold"
                />
                Email transaction confirmations
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded border-white/10 bg-noir text-gold accent-gold"
                />
                Security and account log notices
              </label>
            </div>
          </div>
        </div>
      )}
    </UserShell>
  );
}
