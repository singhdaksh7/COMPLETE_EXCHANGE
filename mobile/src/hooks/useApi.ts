import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/api/client';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the fetcher (e.g. pull-to-refresh / retry button). */
  reload: () => void;
}

/**
 * Minimal data-fetching hook with loading/error/empty handling. Re-runs when any
 * value in `deps` changes. Keeps screens free of repeated try/catch boilerplate.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetcher()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, reload };
}
