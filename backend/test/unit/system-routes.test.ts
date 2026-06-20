import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/**
 * Route-level tests for the admin System / Ops Center router.
 *
 * No database: adminAuthenticate and the RBAC permission lookup are mocked so we
 * can drive the REAL adminAuthorize middleware and assert auth + RBAC wiring,
 * plus that responses carry no secrets. The service layer is stubbed.
 */

const { state } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
}));

vi.mock('../../src/middleware/admin-authenticate', () => ({
  adminAuthenticate: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (!state.admin) {
      res
        .status(401)
        .json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    req.admin = state.admin;
    next();
  },
}));

vi.mock('../../src/modules/admin-rbac/admin-rbac.service', () => ({
  adminRbacService: {
    getAdminPermissions: vi.fn(async () => ({
      roles: state.roles,
      permissions: state.permissions,
    })),
  },
}));

vi.mock('../../src/modules/system/system.service', () => ({
  systemService: {
    overview: vi.fn(async () => ({ status: 'ok', flags: { mailProvider: 'ses' } })),
    health: vi.fn(async () => ({
      status: 'ok',
      dependencies: { database: 'ok', redis: 'ok' },
    })),
    queues: vi.fn(async () => ({ pendingInrDeposits: 3, pendingWithdrawals: 4, kycPending: 7 })),
    scanner: vi.fn(async () => ({ chains: [{ chain: 'TRON', providerMode: 'mock' }], recentErrors: [] })),
    mail: vi.fn(async () => ({ provider: 'ses', fromDomain: 'exorain.com', recentFailures: 0 })),
    riskAlerts: vi.fn(async () => ({ highRiskUsers: 5, frozenUsers: 1 })),
  },
}));

import { adminSystemRouter } from '../../src/modules/system/system.routes';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/system', adminSystemRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function asAdmin(roles: string[], permissions: string[]): void {
  state.admin = { id: 'admin-1', sessionId: 'sess-1' };
  state.roles = roles;
  state.permissions = permissions;
}

beforeEach(() => {
  state.admin = null;
  state.roles = [];
  state.permissions = [];
});

describe('admin system routes — authentication', () => {
  for (const path of ['/system/overview', '/system/health', '/system/queues', '/system/scanner', '/system/mail', '/system/risk-alerts']) {
    it(`requires authentication for GET ${path}`, async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    });
  }
});

describe('admin system routes — RBAC', () => {
  it('overview requires system.view (403 without it, 200 with it)', async () => {
    asAdmin(['SUPPORT'], []);
    expect((await request(app).get('/system/overview')).status).toBe(403);

    asAdmin(['SUPPORT'], ['system.view']);
    const ok = await request(app).get('/system/overview');
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('ok');
  });

  it('health requires system.health.view (system.view alone is not enough)', async () => {
    asAdmin(['OPS'], ['system.view']);
    expect((await request(app).get('/system/health')).status).toBe(403);

    asAdmin(['OPS'], ['system.health.view']);
    const ok = await request(app).get('/system/health');
    expect(ok.status).toBe(200);
    expect(ok.body.data.dependencies).toEqual({ database: 'ok', redis: 'ok' });
  });

  it('risk-alerts requires system.risk.view (system.view alone is not enough)', async () => {
    asAdmin(['OPS'], ['system.view']);
    expect((await request(app).get('/system/risk-alerts')).status).toBe(403);

    asAdmin(['COMPLIANCE'], ['system.risk.view']);
    const ok = await request(app).get('/system/risk-alerts');
    expect(ok.status).toBe(200);
    expect(ok.body.data.highRiskUsers).toBe(5);
  });

  it('queues / scanner / mail are gated by system.view', async () => {
    asAdmin(['X'], []);
    for (const p of ['/system/queues', '/system/scanner', '/system/mail']) {
      expect((await request(app).get(p)).status).toBe(403);
    }
    asAdmin(['X'], ['system.view']);
    for (const p of ['/system/queues', '/system/scanner', '/system/mail']) {
      expect((await request(app).get(p)).status).toBe(200);
    }
  });

  it('SUPER_ADMIN bypasses explicit permission checks', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/system/overview')).status).toBe(200);
    expect((await request(app).get('/system/health')).status).toBe(200);
    expect((await request(app).get('/system/risk-alerts')).status).toBe(200);
  });
});

describe('admin system routes — no secret leakage', () => {
  it('mail response exposes provider + domain only, no credentials', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    const res = await request(app).get('/system/mail');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/secret|password|accessKey|credential|privateKey/i);
    expect(res.body.data.fromDomain).toBe('exorain.com');
  });
});
