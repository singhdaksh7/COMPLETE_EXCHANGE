'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { UserNav } from './nav';

const POLICY_LABELS: Record<string, string> = {
  TERMS_OF_SERVICE: 'Terms of Service',
  PRIVACY_POLICY: 'Privacy Policy',
  RISK_DISCLOSURE: 'Risk Disclosure',
};

/**
 * Stage 9A — consent banner for existing users. Shows when the backend reports
 * outstanding required policies, and accepts the current versions on click
 * (recording ip/ua evidence server-side). Financial actions (KYC/deposit/
 * withdrawal/trading) stay gated until this is cleared.
 */
function ConsentRequiredNotice() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['consent-status'], queryFn: () => userApi.consentStatus(), retry: false });
  const accept = useMutation({
    mutationFn: async (missing: string[]) => {
      for (const documentType of missing) await userApi.acceptPolicy(documentType);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-status'] }),
  });
  const status = q.data?.data;
  if (!status || status.upToDate || status.missing.length === 0) return null;
  const labels = status.missing.map((m) => POLICY_LABELS[m] ?? m).join(', ');
  return (
    <div className="mb-5 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-xs text-gold flex flex-col sm:flex-row sm:items-center gap-3">
      <span className="flex-1">
        Please review and accept the current <span className="font-semibold">{labels}</span> to
        continue using deposits, withdrawals, trading and KYC.
      </span>
      <button
        onClick={() => accept.mutate(status.missing)}
        disabled={accept.isPending}
        className="shrink-0 rounded-lg bg-gold/90 px-4 py-1.5 text-[11px] font-bold text-noir hover:bg-gold transition disabled:opacity-40"
      >
        {accept.isPending ? 'Accepting…' : 'Accept & continue'}
      </button>
    </div>
  );
}

/**
 * Non-blocking Stage 13 notice. Shown only when the backend reports the
 * temporary login bypass is active AND this user is not yet verified — so it
 * never nags a verified user and disappears automatically once bypass is off.
 */
function EmailVerificationBypassNotice() {
  const q = useQuery({ queryKey: ['me'], queryFn: () => userApi.me(), retry: false });
  const me = q.data?.data;
  if (!me?.emailVerificationBypass || me.user.emailVerifiedAt) return null;
  return (
    <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
      Email verification is temporarily disabled for testing. You can use the app
      without verifying your email.
    </div>
  );
}

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

interface UserShellProps {
  children: React.ReactNode;
  className?: string;
}

export function UserShell({ children, className = '' }: UserShellProps) {
  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-20">
      <UserNav />
      <BackdropGlow />
      <main className={`relative z-10 lg:pl-64 pt-20 px-6 mx-auto ${className}`}>
        <EmailVerificationBypassNotice />
        <ConsentRequiredNotice />
        {children}
      </main>
    </div>
  );
}
