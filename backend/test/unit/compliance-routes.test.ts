import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/**
 * Route-level tests for the compliance surface.
 *  - User routes use the REAL authenticate middleware (no token → 401).
 *  - Admin routes mock adminAuthenticate + the RBAC lookup so the REAL
 *    adminAuthorize is exercised, proving each route's permission gate.
 * The service layer is stubbed (no DB).
 */

const { state } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
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

vi.mock('../../src/modules/compliance/compliance.service', () => ({
  complianceService: {
    listUsers: vi.fn(async () => ({ items: [], nextCursor: null })),
    getDetail: vi.fn(async () => ({ profile: { email: 'u@example.com' }, evidence: [], consents: [], riskAssessments: [], providerMode: 'mock' })),
    getEvidence: vi.fn(async () => ({ evidence: [], consents: [] })),
    review: vi.fn(async () => ({ profile: { status: 'APPROVED' } })),
    setRisk: vi.fn(async () => ({ profile: { riskLevel: 'HIGH' } })),
    exportSummary: vi.fn(async () => ({ disclaimer: 'x', profile: {} })),
    getStatus: vi.fn(async () => null),
  },
}));

import { adminComplianceRouter } from '../../src/modules/compliance/compliance.admin.routes';
import { complianceRouter } from '../../src/modules/compliance/compliance.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/kyc', complianceRouter);
  app.use('/admin/compliance', adminComplianceRouter);
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

describe('user compliance routes require authentication', () => {
  it('GET /kyc/status → 401 without a token', async () => {
    expect((await request(app).get('/kyc/status')).status).toBe(401);
  });
  it('POST /kyc/submit-enhanced → 401 without a token', async () => {
    expect((await request(app).post('/kyc/submit-enhanced').send({})).status).toBe(401);
  });
  it('POST /kyc/liveness/start → 401 without a token', async () => {
    expect((await request(app).post('/kyc/liveness/start')).status).toBe(401);
  });
});

describe('admin compliance routes — authentication', () => {
  it('GET /admin/compliance/users → 401 without an admin', async () => {
    expect((await request(app).get('/admin/compliance/users')).status).toBe(401);
  });
});

describe('admin compliance routes — RBAC', () => {
  it('queue requires compliance.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/users')).status).toBe(403);
    asAdmin(['X'], ['compliance.view']);
    expect((await request(app).get('/admin/compliance/users')).status).toBe(200);
  });

  it('review requires compliance.review (view alone is not enough)', async () => {
    asAdmin(['X'], ['compliance.view']);
    expect((await request(app).post('/admin/compliance/users/u1/review').send({ decision: 'APPROVE' })).status).toBe(403);
    asAdmin(['X'], ['compliance.review']);
    expect((await request(app).post('/admin/compliance/users/u1/review').send({ decision: 'APPROVE' })).status).toBe(200);
  });

  it('risk requires compliance.risk.manage', async () => {
    asAdmin(['X'], ['compliance.view', 'compliance.review']);
    expect((await request(app).post('/admin/compliance/users/u1/risk').send({ level: 'HIGH' })).status).toBe(403);
    asAdmin(['X'], ['compliance.risk.manage']);
    expect((await request(app).post('/admin/compliance/users/u1/risk').send({ level: 'HIGH' })).status).toBe(200);
  });

  it('export requires compliance.export', async () => {
    asAdmin(['X'], ['compliance.view']);
    expect((await request(app).get('/admin/compliance/users/u1/export')).status).toBe(403);
    asAdmin(['X'], ['compliance.export']);
    expect((await request(app).get('/admin/compliance/users/u1/export')).status).toBe(200);
  });

  it('SUPER_ADMIN bypasses all compliance permission checks', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/admin/compliance/users')).status).toBe(200);
    expect((await request(app).post('/admin/compliance/users/u1/review').send({ decision: 'APPROVE' })).status).toBe(200);
    expect((await request(app).post('/admin/compliance/users/u1/risk').send({ level: 'HIGH' })).status).toBe(200);
    expect((await request(app).get('/admin/compliance/users/u1/export')).status).toBe(200);
  });
});
