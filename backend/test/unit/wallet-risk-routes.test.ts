import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/** Route-level RBAC tests for the Stage 5.3 wallet-risk + Travel Rule surface. */

const { state } = vi.hoisted(() => ({
  state: { admin: null as { id: string; sessionId: string } | null, roles: [] as string[], permissions: [] as string[] },
}));

vi.mock('../../src/middleware/admin-authenticate', () => ({
  adminAuthenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!state.admin) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    req.admin = state.admin;
    next();
  },
}));

vi.mock('../../src/modules/admin-rbac/admin-rbac.service', () => ({
  adminRbacService: {
    getAdminPermissions: vi.fn(async () => ({ roles: state.roles, permissions: state.permissions })),
  },
}));

vi.mock('../../src/modules/compliance/wallet-risk.service', () => ({
  walletRiskService: {
    runCheck: vi.fn(async () => ({ check: { id: 'c1' }, profileId: 'p1', created: true })),
    listChecks: vi.fn(async () => ({ items: [], nextCursor: null })),
    listProfiles: vi.fn(async () => ({ items: [], nextCursor: null })),
    getProfile: vi.fn(async () => ({ id: 'p1', checks: [], events: [] })),
    review: vi.fn(async () => ({ id: 'c1' })),
    summary: vi.fn(async () => ({ highRiskProfiles: 0, blockedProfiles: 0, reviewRequiredChecks: 0, pendingTravelRule: 0 })),
  },
}));

vi.mock('../../src/modules/compliance/travel-rule.service', () => ({
  travelRuleService: {
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    get: vi.fn(async () => ({ id: 't1' })),
    applyAction: vi.fn(async () => ({ id: 't1' })),
    exportMockPacket: vi.fn(async () => ({ exportType: 'TRAVEL_RULE_MOCK_ONLY' })),
  },
}));

import { adminWalletRiskRouter } from '../../src/modules/compliance/wallet-risk.admin.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/admin/compliance', adminWalletRiskRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const UUID = '11111111-1111-1111-1111-111111111111';

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

describe('wallet-risk routes — authentication', () => {
  it('GET checks → 401 without an admin', async () => {
    expect((await request(app).get('/admin/compliance/wallet-risk/checks')).status).toBe(401);
  });
});

describe('wallet-risk routes — RBAC', () => {
  it('list checks requires compliance.walletRisk.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/wallet-risk/checks')).status).toBe(403);
    asAdmin(['X'], ['compliance.walletRisk.view']);
    expect((await request(app).get('/admin/compliance/wallet-risk/checks')).status).toBe(200);
  });

  it('run requires compliance.walletRisk.run (view alone is not enough)', async () => {
    asAdmin(['X'], ['compliance.walletRisk.view']);
    expect((await request(app).post('/admin/compliance/wallet-risk/run').send({ chain: 'ETH', address: '0xabc' })).status).toBe(403);
    asAdmin(['X'], ['compliance.walletRisk.run']);
    expect((await request(app).post('/admin/compliance/wallet-risk/run').send({ chain: 'ETH', address: '0xabc' })).status).toBe(201);
  });

  it('review requires compliance.walletRisk.review', async () => {
    asAdmin(['X'], ['compliance.walletRisk.view']);
    expect((await request(app).post(`/admin/compliance/wallet-risk/checks/${UUID}/review`).send({ decision: 'CLEAR' })).status).toBe(403);
    asAdmin(['X'], ['compliance.walletRisk.review']);
    expect((await request(app).post(`/admin/compliance/wallet-risk/checks/${UUID}/review`).send({ decision: 'CLEAR' })).status).toBe(200);
  });

  it('travel-rule list requires compliance.travelRule.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/travel-rule')).status).toBe(403);
    asAdmin(['X'], ['compliance.travelRule.view']);
    expect((await request(app).get('/admin/compliance/travel-rule')).status).toBe(200);
  });

  it('travel-rule status requires compliance.travelRule.manage', async () => {
    asAdmin(['X'], ['compliance.travelRule.view']);
    expect((await request(app).post(`/admin/compliance/travel-rule/${UUID}/status`).send({ action: 'COLLECTED' })).status).toBe(403);
    asAdmin(['X'], ['compliance.travelRule.manage']);
    expect((await request(app).post(`/admin/compliance/travel-rule/${UUID}/status`).send({ action: 'COLLECTED' })).status).toBe(200);
  });

  it('travel-rule export requires compliance.travelRule.export', async () => {
    asAdmin(['X'], ['compliance.travelRule.view']);
    expect((await request(app).get(`/admin/compliance/travel-rule/${UUID}/export`)).status).toBe(403);
    asAdmin(['X'], ['compliance.travelRule.export']);
    expect((await request(app).get(`/admin/compliance/travel-rule/${UUID}/export`)).status).toBe(200);
  });

  it('SUPER_ADMIN bypasses all wallet-risk/travel-rule checks', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/admin/compliance/wallet-risk/checks')).status).toBe(200);
    expect((await request(app).post('/admin/compliance/wallet-risk/run').send({ chain: 'ETH', address: '0xabc' })).status).toBe(201);
    expect((await request(app).get('/admin/compliance/travel-rule')).status).toBe(200);
  });
});
