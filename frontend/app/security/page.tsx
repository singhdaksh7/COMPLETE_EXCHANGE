'use client';

import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';

export default function SecurityPage() {
  const ready = useGuard('user');

  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    enabled: ready,
  });

  if (!ready) return null;
  const me = q.data?.data;

  return (
    <UserShell className="max-w-[1400px] space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Security Center</h1>
            <p className="text-[10px] text-white/45 tracking-wide uppercase mt-1">Home &gt; Security</p>
          </div>
        </div>

        {q.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(q.error)}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1: Two-Factor Authentication */}
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-6 shadow-gold-soft backdrop-blur-2xl">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
            <div className="relative z-10 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-sm font-bold text-white">Two-Factor Authentication (2FA)</h3>
                <span className="bg-up/10 text-up font-bold text-[8px] uppercase tracking-wider px-2 py-0.5 rounded">Active</span>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Add an extra layer of security to your account by configuring TOTP authentication. You will be prompted for codes during logins and withdrawal confirmations.
              </p>
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-white/40">Method: Google Authenticator</span>
                <button className="rounded-lg border border-white/[0.12] bg-white/[0.02] px-4 py-2 text-xs font-bold text-white hover:border-gold/40 hover:bg-white/[0.04] transition">
                  Manage 2FA
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Anti-Phishing Code */}
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-6 shadow-gold-soft backdrop-blur-2xl">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
            <div className="relative z-10 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-sm font-bold text-white">Anti-Phishing Verification Code</h3>
                <span className="bg-up/10 text-up font-bold text-[8px] uppercase tracking-wider px-2 py-0.5 rounded">Active</span>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Set a secret code that will be displayed in the header of all official Exora transaction and security emails to confirm their authenticity.
              </p>
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-white/40">Active Code: configured</span>
                <button className="rounded-lg border border-white/[0.12] bg-white/[0.02] px-4 py-2 text-xs font-bold text-white hover:border-gold/40 hover:bg-white/[0.04] transition">
                  Change Code
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Change Password */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Modify Account Password</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Regularly updating your account password minimizes threat surface. Passwords must be at least 8 characters and contain letters and numbers.
              </p>
              <div className="pt-2">
                <button className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition">
                  Update Password
                </button>
              </div>
            </div>
          </div>

          {/* Card 4: Session Management */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Active Session logs</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Review devices currently authenticated to your Exora account. Disconnect unrecognized sessions immediately.
              </p>
              <div className="space-y-2 text-xs font-mono pt-1">
                <div className="flex justify-between text-white/45"><span>Chrome (Windows) · active</span><span>UID: EXO{me?.user.id.slice(0, 5).toUpperCase()}</span></div>
                <div className="flex justify-between text-white/45"><span>Mobile App (iOS)</span><span>Last active: 10 mins ago</span></div>
              </div>
            </div>
          </div>

        </div>

      </UserShell>
  );
}
