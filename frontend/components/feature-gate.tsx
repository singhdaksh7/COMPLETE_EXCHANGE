'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import type { UserFeatureMap } from '@/lib/types';

/**
 * Stage 15 — frontend feature visibility.
 *
 * Reads the effective feature map from /auth/me (already AND-ed with the global
 * compliance flags on the backend) and exposes helpers to hide menus/tabs and
 * to render a clean "Access unavailable" page for direct route hits. This is
 * presentation only — the backend independently enforces every feature via
 * requireUserFeature, so hiding UI is never the security boundary.
 */

export type FeatureKey = keyof UserFeatureMap;

/**
 * Effective features for the signed-in user. While /me is loading, every
 * feature reads `false` so we never flash a disabled module as enabled. Once
 * loaded, a response without `features` (older backend) is treated as all-on.
 */
export function useUserFeatures(): { features: UserFeatureMap; loading: boolean } {
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    retry: false,
    staleTime: 30_000,
  });

  const loading = q.isLoading;
  const all = (v: boolean): UserFeatureMap => ({
    inrDeposit: v,
    inrWithdrawal: v,
    trading: v,
    cryptoWallet: v,
    cryptoDeposit: v,
    cryptoWithdrawal: v,
  });

  if (loading) return { features: all(false), loading: true };
  const fromApi = q.data?.data.features;
  return { features: fromApi ?? all(true), loading: false };
}

/**
 * Clean "Access unavailable" surface for a disabled feature reached directly
 * (deep link / bookmark). Renders inside the page, never breaks the layout.
 */
export function AccessUnavailable({
  title = 'Access unavailable',
  message = 'This feature is currently unavailable for your account.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-gold/5 text-xl">
        🔒
      </div>
      <h1 className="text-lg font-bold text-white">{title}</h1>
      <p className="mt-2 text-sm text-white/55">{message}</p>
      <p className="mt-1 text-xs text-white/35">
        If you believe this is a mistake, please contact support.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-lg border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gold transition hover:bg-gold/20"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

/**
 * Render `children` only when the given feature is enabled; otherwise render
 * `fallback` (default: AccessUnavailable). Renders nothing while /me loads.
 */
export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { features, loading } = useUserFeatures();
  if (loading) return null;
  if (features[feature]) return <>{children}</>;
  return <>{fallback ?? <AccessUnavailable />}</>;
}
