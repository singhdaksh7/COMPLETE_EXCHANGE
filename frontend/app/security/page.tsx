'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { TwoFaSetupData, UserActivityEvent } from '@/lib/types';

/** Friendly labels for the audit action codes shown in the activity feed. */
const ACTION_LABELS: Record<string, string> = {
  'auth.register': 'Account created',
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.password_changed': 'Password changed',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_reset': 'Password reset',
  'auth.session_revoked': 'Session revoked',
  'auth.sessions_revoked_all': 'All other sessions signed out',
  'auth.previous_session_revoked': 'Previous session signed out (new login)',
  'auth.login_new_device': 'New device sign-in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.login_locked': 'Sign-in temporarily locked',
  'auth.email_verified': 'Email verified',
  'inr.deposit.manual_submitted': 'INR deposit submitted',
  'kyc.submitted': 'KYC submitted',
  'user.2fa_setup_started': '2FA setup started',
  'user.2fa_enabled': 'Two-factor enabled',
  'user.2fa_disabled': 'Two-factor disabled',
  'user.2fa_disable_failed': '2FA disable failed',
  'user.2fa_login_required': '2FA prompted at login',
  'user.2fa_login_success': '2FA login verified',
  'user.2fa_login_failed': '2FA login failed',
  'user.backup_code_used': 'Backup code used',
  'user.backup_codes_regenerated': 'Backup codes regenerated',
  'user.step_up_verified': 'Step-up verified',
  'user.step_up_failed': 'Step-up failed',
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
  const twoFaQ = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => userApi.get2faStatus(),
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
  const twoFa = twoFaQ.data?.data;
  const twoFaEnabled = twoFa?.enabled ?? false;

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
              <dd className={twoFaEnabled ? 'text-up' : 'text-white/60'}>
                {twoFaQ.isLoading ? '…' : twoFaEnabled ? 'Enabled' : 'Not enabled'}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Two-factor authentication (REAL — Stage 3) */}
        <TwoFactorCard
          isLoading={twoFaQ.isLoading}
          enabled={twoFaEnabled}
          backupCodesRemaining={twoFa?.backupCodesRemaining ?? 0}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['2fa-status'] });
            qc.invalidateQueries({ queryKey: ['me'] });
            qc.invalidateQueries({ queryKey: ['activity'] });
          }}
        />

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

        {/* Active sessions (REAL — single active session policy) */}
        <Card>
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
            <h3 className="text-sm font-bold text-white">Active sessions</h3>
            {!sessionsQ.isLoading && (
              <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/60">
                {sessions.length} device{sessions.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
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
                  <span className="block text-[10px] text-white/40 mt-0.5">
                    {s.location
                      ? `Location: ${s.location.lat.toFixed(3)}, ${s.location.lng.toFixed(3)} (approx${
                          s.location.accuracy ? `, ±${Math.round(s.location.accuracy)}m` : ''
                        })`
                      : 'Location: not captured'}
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
          <p className="mt-3 text-[10px] text-white/35 leading-relaxed">
            Only one active session is allowed at a time. Signing in on a new device
            automatically signs out your previous session. Login location is a
            consented approximate signal, not exact.
          </p>
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

/* ------------------------------------------------------------------ */
/* Two-factor authentication management (Stage 3 — TOTP + backup codes)*/
/* ------------------------------------------------------------------ */

/** A one-time reveal of backup codes. They are never retrievable again. */
function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="mt-3 rounded-lg border border-gold/25 bg-gold/[0.04] p-3">
      <p className="text-[11px] font-bold text-gold uppercase tracking-wide">
        Save your backup codes
      </p>
      <p className="mt-1 text-[11px] text-white/55">
        Each code works once if you lose your authenticator. They will not be shown
        again — store them somewhere safe now.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {codes.map((c) => (
          <code
            key={c}
            className="rounded bg-noir/80 px-2 py-1 text-center font-mono text-xs text-white"
          >
            {c}
          </code>
        ))}
      </div>
    </div>
  );
}

function TwoFactorCard({
  isLoading,
  enabled,
  backupCodesRemaining,
  onChanged,
}: {
  isLoading: boolean;
  enabled: boolean;
  backupCodesRemaining: number;
  onChanged: () => void;
}) {
  // Enrollment state (only used while enabling).
  const [setupData, setSetupData] = useState<TwoFaSetupData | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  // One-time backup code reveal (after enable or regenerate).
  const [revealedCodes, setRevealedCodes] = useState<string[] | null>(null);
  // Disable form.
  const [showDisable, setShowDisable] = useState(false);
  const [disablePw, setDisablePw] = useState('');
  const [disableCode, setDisableCode] = useState('');
  // Regenerate form.
  const [showRegen, setShowRegen] = useState(false);
  const [regenCode, setRegenCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function reset() {
    setSetupData(null);
    setConfirmCode('');
    setShowDisable(false);
    setDisablePw('');
    setDisableCode('');
    setShowRegen(false);
    setRegenCode('');
  }

  const setup = useMutation({
    mutationFn: () => userApi.setup2fa(),
    onSuccess: (res) => {
      setMsg(null);
      setSetupData(res.data);
    },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  const confirm = useMutation({
    mutationFn: () => userApi.confirm2fa(confirmCode.trim()),
    onSuccess: (res) => {
      setSetupData(null);
      setConfirmCode('');
      setRevealedCodes(res.data.backupCodes);
      setMsg({ ok: true, text: 'Two-factor authentication is now enabled.' });
      onChanged();
    },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  const disable = useMutation({
    mutationFn: () => userApi.disable2fa(disablePw, disableCode.trim()),
    onSuccess: () => {
      reset();
      setRevealedCodes(null);
      setMsg({ ok: true, text: 'Two-factor authentication has been disabled.' });
      onChanged();
    },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  const regen = useMutation({
    mutationFn: () => userApi.regenerateBackupCodes(regenCode.trim()),
    onSuccess: (res) => {
      setShowRegen(false);
      setRegenCode('');
      setRevealedCodes(res.data.backupCodes);
      setMsg({ ok: true, text: 'New backup codes generated. Previous codes are now void.' });
      onChanged();
    },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
        <h3 className="text-sm font-bold text-white">Two-factor authentication</h3>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
            enabled ? 'bg-up/15 text-up' : 'bg-white/5 text-white/50'
          }`}
        >
          {isLoading ? '…' : enabled ? 'ENABLED' : 'OFF'}
        </span>
      </div>

      {msg && (
        <p className={`mb-3 text-[11px] ${msg.ok ? 'text-up' : 'text-red-300'}`}>{msg.text}</p>
      )}

      {/* One-time backup-code reveal sits above everything once present. */}
      {revealedCodes && (
        <>
          <BackupCodes codes={revealedCodes} />
          <button
            onClick={() => setRevealedCodes(null)}
            className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/70 hover:text-white transition"
          >
            I&rsquo;ve saved my backup codes
          </button>
        </>
      )}

      {/* ---- NOT ENABLED: enrollment flow ---- */}
      {!enabled && !revealedCodes && (
        <>
          {!setupData && (
            <>
              <p className="text-xs text-white/55">
                Protect your account with an authenticator app (Google Authenticator,
                Authy, 1Password). You&rsquo;ll be asked for a code at sign-in.
              </p>
              <button
                onClick={() => setup.mutate()}
                disabled={setup.isPending}
                className="mt-3 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
              >
                {setup.isPending ? 'Starting…' : 'Set up 2FA'}
              </button>
            </>
          )}

          {setupData && (
            <div className="space-y-3">
              <p className="text-xs text-white/55">
                Add this account to your authenticator app, then enter the 6-digit code
                it shows to confirm.
              </p>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-white/40">
                  Manual entry key
                </p>
                <code className="mt-1 block break-all rounded-lg border border-white/10 bg-noir/80 px-3 py-2 font-mono text-xs text-gold">
                  {setupData.secret}
                </code>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-white/40">
                  otpauth URI
                </p>
                <code className="mt-1 block break-all rounded-lg border border-white/10 bg-noir/80 px-3 py-2 font-mono text-[10px] text-white/70">
                  {setupData.otpauthUri}
                </code>
              </div>
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setMsg(null);
                  confirm.mutate();
                }}
              >
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-noir/80 py-2.5 px-3 text-center tracking-widest text-sm text-white focus:border-gold/60 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={confirm.isPending || confirmCode.trim().length < 6}
                    className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
                  >
                    {confirm.isPending ? 'Verifying…' : 'Confirm & enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSetupData(null);
                      setConfirmCode('');
                      setMsg(null);
                    }}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:text-white transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* ---- ENABLED: manage (regenerate / disable) ---- */}
      {enabled && (
        <div className="space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-white/45">Backup codes remaining</span>
            <span className="font-mono text-white">{backupCodesRemaining}</span>
          </div>

          {/* Regenerate backup codes (step-up: current code required) */}
          {!showRegen ? (
            <button
              onClick={() => {
                setShowRegen(true);
                setShowDisable(false);
                setMsg(null);
              }}
              className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/70 hover:text-white transition"
            >
              Regenerate backup codes
            </button>
          ) : (
            <form
              className="space-y-2 rounded-lg border border-white/5 bg-white/[0.01] p-3"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg(null);
                regen.mutate();
              }}
            >
              <p className="text-[11px] text-white/50">
                Confirm with a current authenticator or backup code. This voids your
                existing backup codes.
              </p>
              <input
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="Authenticator or backup code"
                value={regenCode}
                onChange={(e) => setRegenCode(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-noir/80 py-2 px-3 text-sm text-white focus:border-gold/60 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={regen.isPending || regenCode.trim().length < 6}
                  className="rounded-lg bg-gold/90 px-3 py-2 text-[11px] font-bold text-noir hover:brightness-105 transition disabled:opacity-50"
                >
                  {regen.isPending ? 'Generating…' : 'Generate new codes'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRegen(false);
                    setRegenCode('');
                  }}
                  className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/60 hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Disable 2FA (requires password + current code) */}
          {!showDisable ? (
            <button
              onClick={() => {
                setShowDisable(true);
                setShowRegen(false);
                setMsg(null);
              }}
              className="block rounded-lg border border-red-500/20 px-3 py-2 text-[11px] text-red-300 hover:border-red-500/40 transition"
            >
              Disable two-factor authentication
            </button>
          ) : (
            <form
              className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg(null);
                disable.mutate();
              }}
            >
              <p className="text-[11px] text-white/55">
                Enter your password and a current authenticator/backup code to turn off
                2FA. Your backup codes will be deleted.
              </p>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={disablePw}
                onChange={(e) => setDisablePw(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-noir/80 py-2 px-3 text-sm text-white focus:border-gold/60 focus:outline-none"
              />
              <input
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="Authenticator or backup code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-noir/80 py-2 px-3 text-sm text-white focus:border-gold/60 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={disable.isPending || !disablePw || disableCode.trim().length < 6}
                  className="rounded-lg bg-red-500/80 px-3 py-2 text-[11px] font-bold text-white hover:brightness-110 transition disabled:opacity-50"
                >
                  {disable.isPending ? 'Disabling…' : 'Disable 2FA'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDisable(false);
                    setDisablePw('');
                    setDisableCode('');
                  }}
                  className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/60 hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
