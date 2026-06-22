import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/**
 * Route-level RBAC tests for the Stage 5.2 monitoring/case surface. The admin
 * authenticate middleware + RBAC lookup are mocked so the REAL adminAuthorize is
 * exercised, proving each route's permission gate. The services are stubbed.
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

vi.mock('../../src/modules/compliance/case.service', () => ({
  caseService: {
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    summary: vi.fn(async () => ({ openCases: 0, highCriticalCases: 0, openAlerts: 0, strDrafted: 0 })),
    get: vi.fn(async () => ({ id: 'c1' })),
    create: vi.fn(async () => ({ id: 'c1' })),
    assign: vi.fn(async () => ({ id: 'c1' })),
    setStatus: vi.fn(async () => ({ id: 'c1' })),
    addNote: vi.fn(async () => ({ id: 'c1' })),
    listAlerts: vi.fn(async () => ({ items: [] })),
    linkAlert: vi.fn(async () => ({ id: 'c1' })),
    setAlertStatus: vi.fn(async () => ({ id: 'a1' })),
    exportStrDraft: vi.fn(async () => ({ exportType: 'STR_DRAFT_ONLY' })),
  },
}));

vi.mock('../../src/modules/compliance/monitoring.service', () => ({
  monitoringService: {
    run: vi.fn(async () => ({ usersEvaluated: 0, alertsCreated: 0, alertsExisting: 0, casesCreated: 0, alertsLinked: 0 })),
  },
}));

import { adminComplianceCasesRouter } from '../../src/modules/compliance/compliance.cases.admin.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/admin/compliance', adminComplianceCasesRouter);
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

describe('cases routes — authentication', () => {
  it('GET /cases → 401 without an admin', async () => {
    expect((await request(app).get('/admin/compliance/cases')).status).toBe(401);
  });
});

describe('cases routes — RBAC', () => {
  it('list requires compliance.case.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/cases')).status).toBe(403);
    asAdmin(['X'], ['compliance.case.view']);
    expect((await request(app).get('/admin/compliance/cases')).status).toBe(200);
  });

  it('summary requires compliance.case.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/cases/summary')).status).toBe(403);
    asAdmin(['X'], ['compliance.case.view']);
    expect((await request(app).get('/admin/compliance/cases/summary')).status).toBe(200);
  });

  it('create requires compliance.case.manage (view alone is not enough)', async () => {
    asAdmin(['X'], ['compliance.case.view']);
    expect((await request(app).post('/admin/compliance/cases').send({ userId: UUID, title: 'Manual case' })).status).toBe(403);
    asAdmin(['X'], ['compliance.case.manage']);
    // 201 Created on success.
    expect((await request(app).post('/admin/compliance/cases').send({ userId: UUID, title: 'Manual case' })).status).toBe(201);
  });

  it('status requires compliance.case.manage', async () => {
    asAdmin(['X'], ['compliance.case.view']);
    expect((await request(app).post(`/admin/compliance/cases/${UUID}/status`).send({ status: 'IN_REVIEW' })).status).toBe(403);
    asAdmin(['X'], ['compliance.case.manage']);
    expect((await request(app).post(`/admin/compliance/cases/${UUID}/status`).send({ status: 'IN_REVIEW' })).status).toBe(200);
  });

  it('assign requires compliance.case.assign', async () => {
    asAdmin(['X'], ['compliance.case.manage']);
    expect((await request(app).post(`/admin/compliance/cases/${UUID}/assign`).send({ adminId: null })).status).toBe(403);
    asAdmin(['X'], ['compliance.case.assign']);
    expect((await request(app).post(`/admin/compliance/cases/${UUID}/assign`).send({ adminId: null })).status).toBe(200);
  });

  it('export-str-draft requires compliance.str.export', async () => {
    asAdmin(['X'], ['compliance.case.view']);
    expect((await request(app).get(`/admin/compliance/cases/${UUID}/export-str-draft`)).status).toBe(403);
    asAdmin(['X'], ['compliance.str.export']);
    expect((await request(app).get(`/admin/compliance/cases/${UUID}/export-str-draft`)).status).toBe(200);
  });

  it('alert link/status require compliance.alert.manage', async () => {
    asAdmin(['X'], ['compliance.alert.view']);
    expect((await request(app).post(`/admin/compliance/alerts/${UUID}/status`).send({ status: 'DISMISSED' })).status).toBe(403);
    asAdmin(['X'], ['compliance.alert.manage']);
    expect((await request(app).post(`/admin/compliance/alerts/${UUID}/status`).send({ status: 'DISMISSED' })).status).toBe(200);
    expect((await request(app).post(`/admin/compliance/alerts/${UUID}/link-case`).send({ caseId: UUID })).status).toBe(200);
  });

  it('alerts list requires compliance.alert.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/alerts')).status).toBe(403);
    asAdmin(['X'], ['compliance.alert.view']);
    expect((await request(app).get('/admin/compliance/alerts')).status).toBe(200);
  });

  it('monitoring run requires compliance.monitoring.run', async () => {
    asAdmin(['X'], ['compliance.case.view']);
    expect((await request(app).post('/admin/compliance/monitoring/run').send({})).status).toBe(403);
    asAdmin(['X'], ['compliance.monitoring.run']);
    expect((await request(app).post('/admin/compliance/monitoring/run').send({})).status).toBe(200);
  });

  it('SUPER_ADMIN bypasses all case permission checks', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/admin/compliance/cases')).status).toBe(200);
    expect((await request(app).post('/admin/compliance/monitoring/run').send({})).status).toBe(200);
    expect((await request(app).get(`/admin/compliance/cases/${UUID}/export-str-draft`)).status).toBe(200);
  });
});
