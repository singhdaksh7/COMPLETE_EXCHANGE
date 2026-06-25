import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Stage 10 — go-live readiness service.
 *
 * config is built once at import from process.env, so to exercise different
 * postures we mutate process.env and re-import the module with a fresh registry
 * (vi.resetModules). Each test restores the env it changed.
 */

async function loadReadiness() {
  const { goLiveService } = await import('../../src/modules/system/go-live.service');
  return goLiveService.readiness();
}

const SAVED = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // Restore the baseline test env.
  for (const k of Object.keys(process.env)) {
    if (!(k in SAVED)) delete process.env[k];
  }
  Object.assign(process.env, SAVED);
});

describe('goLiveService.readiness — staging posture (default test env)', () => {
  it('reports warnings (not blockers) when APP_ENV is not production', async () => {
    delete process.env.APP_ENV;
    const r = await loadReadiness();
    expect(r.targetingProduction).toBe(false);
    // Staging never hard-blocks: gaps surface as warnings.
    expect(r.status).toBe('warning');
    expect(r.sections.some((s) => s.status === 'blocked')).toBe(false);
    // All required sections are present.
    expect(r.sections.map((s) => s.key)).toEqual([
      'environment',
      'domain',
      'email_sms',
      'backup',
      'monitoring',
      'security',
      'secrets',
    ]);
    // Checklist has all 13 go-live items, none auto-completed.
    expect(r.checklist).toHaveLength(13);
    expect(r.checklist.every((c) => c.done === false)).toBe(true);
  });

  it('never exposes secret values', async () => {
    const r = await loadReadiness();
    const json = JSON.stringify(r);
    expect(json).not.toContain(process.env.JWT_ACCESS_SECRET ?? '__none__');
    expect(json).not.toContain(process.env.DATABASE_URL ?? '__none__');
    expect(json).not.toContain(process.env.REDIS_URL ?? '__none__');
  });
});

describe('goLiveService.readiness — production posture', () => {
  beforeEach(() => {
    process.env.APP_ENV = 'production';
  });

  it('blocks when production config gaps remain (mock providers, no domains)', async () => {
    const r = await loadReadiness();
    expect(r.targetingProduction).toBe(true);
    expect(r.status).toBe('blocked');
    // At least one blocker is surfaced at the top level.
    expect(r.warnings.some((w) => w.startsWith('[BLOCKER]'))).toBe(true);
    // Email section blocks because the test env uses MAIL_PROVIDER=log.
    const email = r.sections.find((s) => s.key === 'email_sms');
    expect(email?.status).toBe('blocked');
  });

  it('flags wildcard CORS as a blocker in production', async () => {
    process.env.CORS_ORIGINS = '*';
    const r = await loadReadiness();
    const security = r.sections.find((s) => s.key === 'security');
    const cors = security?.checks.find((c) => c.key === 'cors_not_wildcard');
    expect(cors?.status).toBe('blocked');
  });

  it('turns green checks ok when production config is supplied', async () => {
    process.env.MAIL_PROVIDER = 'ses';
    process.env.AWS_REGION = 'ap-south-1';
    process.env.MAIL_FROM = 'Exora <no-reply@exora.com>';
    const r = await loadReadiness();
    const email = r.sections.find((s) => s.key === 'email_sms');
    const provider = email?.checks.find((c) => c.key === 'mail_provider_not_log');
    expect(provider?.status).toBe('ok');
  });

  it('honors operator-set checklist acknowledgements', async () => {
    process.env.GOLIVE_INFRA_CREATED = 'true';
    process.env.GOLIVE_SSL_ACTIVE = 'true';
    const r = await loadReadiness();
    expect(r.checklist.find((c) => c.key === 'infra_created')?.done).toBe(true);
    expect(r.checklist.find((c) => c.key === 'ssl_active')?.done).toBe(true);
    expect(r.checklist.find((c) => c.key === 'dns_configured')?.done).toBe(false);
  });
});
