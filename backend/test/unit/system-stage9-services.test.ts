import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependency-health probes used by the readiness service so we can
// drive healthy / degraded / unhealthy without real Postgres or Redis.
vi.mock('../../src/lib/prisma', () => ({
  isDatabaseHealthy: vi.fn(),
}));
vi.mock('../../src/lib/redis', () => ({
  isRedisHealthy: vi.fn(),
}));

import { isDatabaseHealthy } from '../../src/lib/prisma';
import { isRedisHealthy } from '../../src/lib/redis';
import { getSystemReadiness } from '../../src/modules/system/readiness.service';
import { backupService } from '../../src/modules/system/backup.service';
import { monitoringService } from '../../src/modules/system/monitoring.service';
import { guardrailsService } from '../../src/modules/system/guardrails.service';

const db = vi.mocked(isDatabaseHealthy);
const redis = vi.mocked(isRedisHealthy);

beforeEach(() => {
  vi.clearAllMocks();
  db.mockResolvedValue(true);
  redis.mockResolvedValue(true);
});

describe('Stage 9A — system readiness', () => {
  it('is healthy when DB + Redis are up and required config present', async () => {
    const r = await getSystemReadiness();
    expect(r.status).toBe('healthy');
    expect(r.checks.find((c) => c.key === 'database')?.status).toBe('pass');
    expect(r.checks.find((c) => c.key === 'redis')?.status).toBe('pass');
    expect(r.checks.find((c) => c.key === 'config')?.status).toBe('pass');
    expect(typeof r.timestamp).toBe('string');
    expect(r.build.node).toBe(process.version);
  });

  it('is unhealthy when the database is unreachable', async () => {
    db.mockResolvedValue(false);
    const r = await getSystemReadiness();
    expect(r.status).toBe('unhealthy');
    expect(r.checks.find((c) => c.key === 'database')?.status).toBe('fail');
  });

  it('is degraded when Redis is unreachable but DB is up', async () => {
    redis.mockResolvedValue(false);
    const r = await getSystemReadiness();
    expect(r.status).toBe('degraded');
    expect(r.checks.find((c) => c.key === 'redis')?.status).toBe('fail');
  });

  it('never exposes config values — only names of missing variables', async () => {
    const original = process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    try {
      const r = await getSystemReadiness();
      expect(r.status).toBe('degraded');
      const cfg = r.checks.find((c) => c.key === 'config');
      expect(cfg?.status).toBe('warn');
      expect(cfg?.detail).toContain('JWT_ACCESS_SECRET');
      // The actual secret value must never leak into the report.
      expect(JSON.stringify(r)).not.toContain('test_access_secret');
    } finally {
      if (original !== undefined) process.env.JWT_ACCESS_SECRET = original;
    }
  });
});

describe('Stage 9B — backup status', () => {
  it('flags unknown backup metadata as warnings without failing hard', () => {
    const r = backupService.status();
    expect(r.status).toBe('attention');
    expect(r.warnings.length).toBeGreaterThan(0);
    // Required checklists exist with the documented items.
    const keys = r.backupChecklist.map((i) => i.key);
    expect(keys).toContain('rds_automated_backups');
    expect(keys).toContain('manual_snapshot');
    const restoreKeys = r.restoreDrillChecklist.map((i) => i.key);
    expect(restoreKeys).toContain('restore_test_documented');
    expect(restoreKeys).toContain('secrets_recovery_documented');
    expect(restoreKeys).toContain('rollback_taskdefs_documented');
  });

  it('reflects operator-published metadata when env is set', () => {
    process.env.DB_BACKUP_AUTOMATED = 'true';
    process.env.DB_BACKUP_RETENTION_DAYS = '7';
    process.env.DB_LATEST_SNAPSHOT_ID = 'snap-123';
    process.env.DB_LATEST_SNAPSHOT_AT = '2026-06-01T00:00:00.000Z';
    process.env.DB_RESTORE_TEST_AT = '2026-06-10T00:00:00.000Z';
    vi.resetModules();
    return import('../../src/modules/system/backup.service').then((m) => {
      const r = m.backupService.status();
      expect(r.database.automatedBackups).toBe('enabled');
      expect(r.latestBackup.known).toBe(true);
      expect(r.restoreDrill.documented).toBe(true);
      // Cleanup so other tests see a clean env.
      delete process.env.DB_BACKUP_AUTOMATED;
      delete process.env.DB_BACKUP_RETENTION_DAYS;
      delete process.env.DB_LATEST_SNAPSHOT_ID;
      delete process.env.DB_LATEST_SNAPSHOT_AT;
      delete process.env.DB_RESTORE_TEST_AT;
    });
  });
});

describe('Stage 9C — monitoring status', () => {
  it('lists all eight alerts as configurable and marks missing ones', () => {
    const r = monitoringService.status();
    expect(r.totalCount).toBe(8);
    expect(r.alerts.map((a) => a.key)).toEqual(
      expect.arrayContaining([
        'api_5xx',
        'admin_5xx',
        'ecs_task_crash',
        'rds_cpu_storage',
        'redis_connection',
        'failed_login_spike',
        'withdrawal_failure_spike',
        'kyc_queue_growth',
      ]),
    );
    // Defaults: nothing configured yet → attention + warnings.
    expect(r.status).toBe('attention');
    expect(r.warnings.length).toBe(8);
    for (const a of r.alerts) expect(a.recommendedThreshold.length).toBeGreaterThan(0);
  });
});

describe('Stage 9E — guardrails status', () => {
  it('reports enforced and planned guardrails without secrets', () => {
    const r = guardrailsService.status();
    expect(r.totalCount).toBeGreaterThan(0);
    expect(r.enforcedCount).toBeGreaterThan(0);
    expect(r.plannedCount).toBeGreaterThan(0);
    const keys = r.guardrails.map((g) => g.key);
    expect(keys).toContain('auth_rate_limit');
    expect(keys).toContain('admin_sensitive_rate_limit');
    expect(keys).toContain('withdrawal_dual_approval');
    expect(keys).toContain('withdrawal_lock_after_security_change');
    // The payload must not leak real secret VALUES (e.g. the JWT secret).
    expect(JSON.stringify(r)).not.toContain(process.env.JWT_ACCESS_SECRET ?? '__none__');
    expect(JSON.stringify(r)).not.toContain(process.env.DATABASE_URL ?? '__none__');
  });
});
