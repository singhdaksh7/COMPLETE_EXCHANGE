import { isDatabaseHealthy } from '../../lib/prisma';
import { isRedisHealthy } from '../../lib/redis';
import { config } from '../../config';

/**
 * Stage 9A — structured readiness for the admin System console.
 *
 * This is a RICHER companion to the load-balancer `/ready` probe
 * (modules/health). It returns an itemized checklist the admin UI can render
 * (DB, Redis, required configuration presence, build info) rather than a single
 * ok/degraded flag.
 *
 * Hard rule (shared with the rest of the system module): nothing here may leak a
 * secret. Configuration checks report only the variable NAME and a present/
 * missing boolean — never the value. No connection strings, keys, or hosts.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';
export type ReadinessStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ReadinessCheck {
  /** Stable machine-readable key, e.g. `database`, `redis`, `config`. */
  key: string;
  /** Human label for the UI. */
  label: string;
  status: CheckStatus;
  /** Safe, secrets-free detail string. */
  detail: string;
}

export interface SystemReadinessReport {
  status: ReadinessStatus;
  checks: ReadinessCheck[];
  environment: string;
  version: string;
  build: {
    version: string;
    commit: string | null;
    builtAt: string | null;
    node: string;
  };
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Configuration the service needs to operate safely. We only ever report
 * whether each NAME is present — never the value.
 *
 * Deliberately limited to variables that have NO schema default and so MUST be
 * supplied by the environment (see config/env.ts). Variables that carry a safe
 * in-code default (e.g. OTP_HASH_SECRET, KYC_ENCRYPTION_KEY in non-prod) are
 * intentionally excluded — their absence from process.env is not a readiness
 * gap, and flagging them would create false negatives in dev/test.
 */
const REQUIRED_ENV: readonly string[] = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

/** App version, from the package version injected by npm at runtime. */
function appVersion(): string {
  return process.env.npm_package_version ?? '0.1.0';
}

/**
 * Build the structured readiness report. Aggregate status:
 *   - database unreachable           → unhealthy (cannot serve)
 *   - redis unreachable / config gap → degraded  (limited / misconfigured)
 *   - everything reachable + present → healthy
 */
export async function getSystemReadiness(): Promise<SystemReadinessReport> {
  const [databaseOk, redisOk] = await Promise.all([
    isDatabaseHealthy(),
    isRedisHealthy(),
  ]);

  const missingEnv = REQUIRED_ENV.filter((name) => !envPresent(name));

  const checks: ReadinessCheck[] = [
    {
      key: 'database',
      label: 'Database (PostgreSQL)',
      status: databaseOk ? 'pass' : 'fail',
      detail: databaseOk
        ? 'Connectivity verified via lightweight query.'
        : 'Database is not reachable.',
    },
    {
      key: 'redis',
      label: 'Redis',
      status: redisOk ? 'pass' : 'fail',
      detail: redisOk
        ? 'Connectivity verified via PING.'
        : 'Redis is not reachable.',
    },
    {
      key: 'config',
      label: 'Required configuration',
      status: missingEnv.length === 0 ? 'pass' : 'warn',
      detail:
        missingEnv.length === 0
          ? `All ${REQUIRED_ENV.length} required variables are present.`
          : `Missing: ${missingEnv.join(', ')}.`,
    },
  ];

  let status: ReadinessStatus = 'healthy';
  if (!databaseOk) status = 'unhealthy';
  else if (!redisOk || missingEnv.length > 0) status = 'degraded';

  return {
    status,
    checks,
    environment: config.env,
    version: appVersion(),
    build: {
      version: appVersion(),
      // Optional build metadata: present only if the deploy pipeline injects it.
      commit: process.env.GIT_COMMIT ?? process.env.BUILD_COMMIT ?? null,
      builtAt: process.env.BUILD_TIME ?? null,
      node: process.version,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}
