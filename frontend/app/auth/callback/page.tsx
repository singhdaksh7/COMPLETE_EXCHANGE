'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { userApi } from '@/lib/user-api';
import { tokenStore } from '@/lib/auth';

/**
 * OAuth return page. The backend redirects here with a one-time `?code=` (never
 * the tokens). We exchange it for a normal session, store tokens exactly like
 * password login, and continue to the dashboard. Any failure bounces to login
 * with a safe error flag.
 */
export default function AuthCallbackPage() {
  // `useSearchParams` requires a Suspense boundary under static export.
  return (
    <Suspense fallback={<CallbackShell />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!code) {
      router.replace('/login?error=oauth');
      return;
    }

    userApi
      .oauthExchange({ code })
      .then((res) => {
        const { accessToken, refreshToken } = res.data.tokens;
        tokenStore.setUser(accessToken, refreshToken);
        router.replace('/dashboard');
      })
      .catch(() => {
        router.replace('/login?error=oauth');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return <CallbackShell />;
}

function CallbackShell() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-noir font-sans text-white">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      <p className="text-sm text-white/55">Signing you in…</p>
    </div>
  );
}
