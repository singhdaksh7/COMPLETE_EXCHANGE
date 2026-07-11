'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { MarketDataProvider } from '@/lib/market-data-context';

/**
 * React Query provider. A single client per browser session; retries are off so
 * auth/validation failures surface immediately instead of being retried.
 *
 * `MarketDataProvider` is mounted here — the root layout tree, which never
 * remounts across client-side navigation — so the shared live market-data
 * socket subscription and polling loop persist across every page instead of
 * restarting (and briefly conflicting) on each navigation. See
 * `lib/market-data-context.tsx`.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MarketDataProvider>{children}</MarketDataProvider>
    </QueryClientProvider>
  );
}
