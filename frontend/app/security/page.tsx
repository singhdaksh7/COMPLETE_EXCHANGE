'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { UserActivityEvent } from '@/lib/types';

/** Friendly labels for the audit action codes shown in the activity feed. */
const ACTION_LABELS: Record<string, string> = {
  'auth.register': 'Account created',
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.password_changed': 'Password changed',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_reset': 'Password reset',
  'auth.session_revoked': 'Session revoked',
  'auth.email_verified': 'Email verified',
  'inr.deposit.manual_submitted': 'INR deposit submitted',
  'kyc.submitted': 'KYC submitted',
};

function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      {children}
    </div>
  );
}

export default function SecurityPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  const meQ = useQuery({ queryKey: ['me'], queryFn: () => userApi.me(), enabled: ready });
  const sessionsQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => userApi.listSessions(),
    enabled: ready,
  });
  const activityQ = useQuery({
    queryKey: ['activity'],
    queryFn: () => userApi.listActivity(),
    enabled: ready,
  });

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changePw = useMutation({
    mutationFn: () =>
      userApi.changePassword({ currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setPwMsg({ ok: true, text: 'Password updated. Other sessions were signed out.' });
      setCurrent('');
      setNext('');
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (e) => setPwMsg({ ok: false, text: errorMessage(e) }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => userApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  if (!ready) return null;
  const me = meQ.data?.data;
  const sessions = sessionsQ.data?.data.items ?? [];
  const activity = activityQ.data?.data.items ?? [];

  return (
    <UserShell className="max-w-[1100px] space-y-6">
      <div className="border-b border-white/5 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">Security Center</h1>
        <p className="text-[10px] text-white/45 tracking-wide uppercase mt-1">Home &gt; Security</p>
      </div>

      {meQ.isError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
          {errorMessage(meQ.error)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account overview (REAL) */}
        <Card>
          <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2 mb-3">Account</h3>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between"><dt className="text-white/45">Email</dt><dd className="font-mono text-white">{me?.user.email ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-white/45">Email verified</dt><dd className={me?.user.emailVerifiedAt ? 'text-up' : 'text-white/60'}>{me?.user.emailVerifiedAt ? 'Yes' : 'No'}</dd></div>
            <div className="flex justify-between"><dt className="text-white/45">KYC status</dt><dd className="font-mono text-white">{me?.user.kycStatus ?? '—'}</dd></div>
            <div className="flex justify-between">
              <dt className="text-white/45">Two-factor (2FA)</dt>
              <dd className={me?.user.totpEnabled ? 'text-up' : 'text-white/60'}>
                {me?.user.totpEnabled ? 'Enabled' : 'Not enabled'}
              </dd>
            </div>
          </dl>
          {!me?.user.totpEnabled && (
            <p className="mt-3 text-[11px] text-white/40">
              Authenticator-app 2FA for user login is not yet available on this account.
            </p>
          )}
        </Card>

        {/* Change password (REAL) */}
        <Card>
          <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2 mb-3">Change password</h3>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setPwMsg(null);
              changePw.mutate();
            }}
          >
            <input
              type="password"
              placeholder="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-noir/80 py-2.5 px-3 text-sm text-white focus:border-gold/60 focus:outline-none"
            />
            <input
              type="password"
              placeholder="New password (min 8, letters + numbers)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-noir/80 py-2.5 px-3 text-sm text-white focus:border-gold/60 focus:outline-none"
            />
            {pwMsg && (
              <p className={`text-[11px] ${pwMsg.ok ? 'text-up' : 'text-red-300'}`}>{pwMsg.text}</p>
            )}
            <button
              type="submit"
              disabled={changePw.isPending || !current || next.length < 8}
              className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
            >
              {changePw.isPending ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </Card>

        {/* Active sessions (REAL) */}
        <Card>
          <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2 mb-3">Active sessions</h3>
          {sessionsQ.isLoading && <p className="text-xs text-white/40">Loading…</p>}
          {!sessionsQ.isLoading && sessions.length === 0 && (
            <p className="text-xs text-white/40">No active sessions.</p>
          )}
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.01] p-3 text-xs">
                <div>
                  <span className="font-mono text-white">{s.ip ?? 'unknown IP'}</span>
                  {s.current && <span className="ml-2 rounded bg-up/15 px-1.5 py-0.5 text-[9px] font-bold text-up">THIS DEVICE</span>}
                  <span className="block text-[10px] text-white/40 mt-0.5">
                    Signed in {new Date(s.createdAt).toLocaleString()}
                  </span>
                </div>
                {!s.current && (
                  <button
                    onClick={() => revoke.mutate(s.id)}
                    disabled={revoke.isPending}
                    className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/70 hover:border-red-500/40 hover:text-red-300 transition disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Security activity (REAL) */}
        <Card>
          <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2 mb-3">Recent security activity</h3>
          {activityQ.isLoading && <p className="text-xs text-white/40">Loading…</p>}
          {!activityQ.isLoading && activity.length === 0 && (
            <p className="text-xs text-white/40">No recent activity.</p>
          )}
          <div className="space-y-1.5">
            {activity.slice(0, 12).map((a: UserActivityEvent) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-white/80">{actionLabel(a.action)}</span>
                <span className="font-mono text-[10px] text-white/35">{a.ip ?? ''}</span>
                <span className="text-[10px] text-white/40 shrink-0">
                  {new Date(a.occurredAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </UserShell>
  );
}
