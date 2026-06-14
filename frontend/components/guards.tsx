'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/auth';

/**
 * Client-side auth guard. Redirects to the relevant login page when no token is
 * present for the scope, and returns `true` once a token exists so the page can
 * render its protected content.
 */
export function useGuard(scope: 'user' | 'admin'): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token =
      scope === 'user' ? tokenStore.getUserAccess() : tokenStore.getAdminAccess();
    if (!token) {
      router.replace(scope === 'user' ? '/login' : '/admin/login');
    } else {
      setReady(true);
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
