'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { UserNav } from './nav';

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
        {children}
      </main>
    </div>
  );
}
