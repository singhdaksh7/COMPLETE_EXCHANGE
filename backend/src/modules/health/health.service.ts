import { isDatabaseHealthy } from '../../lib/prisma';
import { isRedisHealthy } from '../../lib/redis';
import { config } from '../../config';

export interface HealthMeta {
  service: string;
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
}

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: 'ok' | 'degraded';
    redis: 'ok' | 'degraded';
  };
}

export function getHealthMeta(): HealthMeta {
  return {
    service: 'cex-backend',
    version: process.env.npm_package_version ?? '0.1.0',
    environment: config.env,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
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
  return {
    status,
    ...getHealthMeta(),
    checks: {
      database: database ? 'ok' : 'degraded',
      redis: redisOk ? 'ok' : 'degraded',
    },
  };
}
