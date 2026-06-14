import { isDatabaseHealthy } from '../../lib/prisma';
import { isRedisHealthy } from '../../lib/redis';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: {
    database: boolean;
    redis: boolean;
  };
}

/**
 * Readiness aggregates dependency health. The service is only "ok" when every
 * critical dependency (Postgres, Redis) is reachable; otherwise Nginx / the
 * orchestrator should keep it out of rotation.
 */
export async function getReadiness(): Promise<ReadinessReport> {
  const [database, redisOk] = await Promise.all([
    isDatabaseHealthy(),
    isRedisHealthy(),
  ]);

  const status = database && redisOk ? 'ok' : 'degraded';
  return { status, checks: { database, redis: redisOk } };
}
