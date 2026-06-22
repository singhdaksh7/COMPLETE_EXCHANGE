import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/** Route-level RBAC tests for the Stage 5.5/5.6 admin tax / legal / FIU surface. */

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
  adminRbacService: { getAdminPermissions: vi.fn(async () => ({ roles: state.roles, permissions: state.permissions })) },
}));
vi.mock('../../src/modules/tax/tax.service', () => ({
  taxService: { listRules: vi.fn(async () => []), upsertRule: vi.fn(async () => ({ id: 'r' })), listTds: vi.fn(async () => ({ items: [], nextCursor: null })), listStatements: vi.fn(async () => ({ items: [], nextCursor: null })), generateStatement: vi.fn(async () => ({ id: 's' })) },
  financialYearOf: () => '2025-26',
}));
vi.mock('../../src/modules/legal/legal.service', () => ({
  legalService: { listVersions: vi.fn(async () => []), createDocument: vi.fn(async () => ({ id: 'd' })), listAcceptances: vi.fn(async () => ({ items: [], nextCursor: null })), acceptancesForUser: vi.fn(async () => []) },
}));
vi.mock('../../src/modules/compliance/fiu.service', () => ({
  fiuService: {
    generate: vi.fn(async () => ({ id: 'rep', items: [] })),
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    get: vi.fn(async () => ({ id: 'rep' })),
    validate: vi.fn(async () => ({ id: 'rep' })),
    export: vi.fn(async () => ({ label: 'x' })),
    setStatus: vi.fn(async () => ({ id: 'rep' })),
    listIssues: vi.fn(async () => []),
    listExportEvents: vi.fn(async () => ({ items: [], nextCursor: null })),
  },
}));

import { adminTaxRouter } from '../../src/modules/tax/tax.admin.routes';
import { adminLegalRouter } from '../../src/modules/legal/legal.admin.routes';
import { adminFiuRouter } from '../../src/modules/compliance/fiu.admin.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/admin/tax', adminTaxRouter);
  app.use('/admin/legal', adminLegalRouter);
  app.use('/admin/compliance', adminFiuRouter);
  app.use(errorHandler);
  return app;
}
const app = buildApp();
const UUID = '11111111-1111-1111-1111-111111111111';

function asAdmin(roles: string[], permissions: string[]): void {
  state.admin = { id: 'admin-1', sessionId: 's' };
  state.roles = roles;
  state.permissions = permissions;
}
beforeEach(() => { state.admin = null; state.roles = []; state.permissions = []; });

describe('tax routes — RBAC', () => {
  it('rules view requires tax.rule.view; manage requires tax.rule.manage', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/tax/rules')).status).toBe(403);
    asAdmin(['X'], ['tax.rule.view']);
    expect((await request(app).get('/admin/tax/rules')).status).toBe(200);
    asAdmin(['X'], ['tax.rule.view']);
    expect((await request(app).post('/admin/tax/rules').send({ eventType: 'TRADE_SELL', name: 'Rule name', rateBps: 100 })).status).toBe(403);
    asAdmin(['X'], ['tax.rule.manage']);
    expect((await request(app).post('/admin/tax/rules').send({ eventType: 'TRADE_SELL', name: 'Rule name', rateBps: 100 })).status).toBe(201);
  });
  it('statement generate requires tax.statement.generate', async () => {
    asAdmin(['X'], ['tax.statement.view']);
    expect((await request(app).post('/admin/tax/statements/generate').send({ userId: UUID })).status).toBe(403);
    asAdmin(['X'], ['tax.statement.generate']);
    expect((await request(app).post('/admin/tax/statements/generate').send({ userId: UUID })).status).toBe(201);
  });
});

describe('legal routes — RBAC', () => {
  it('document manage requires legal.document.manage', async () => {
    asAdmin(['X'], ['legal.document.view']);
    expect((await request(app).post('/admin/legal/documents').send({ type: 'FEE_POLICY', version: 'v2', title: 'Title', content: 'content' })).status).toBe(403);
    asAdmin(['X'], ['legal.document.manage']);
    expect((await request(app).post('/admin/legal/documents').send({ type: 'FEE_POLICY', version: 'v2', title: 'Title', content: 'content' })).status).toBe(201);
  });
  it('acceptances view requires legal.acceptance.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/legal/acceptances')).status).toBe(403);
    asAdmin(['X'], ['legal.acceptance.view']);
    expect((await request(app).get('/admin/legal/acceptances')).status).toBe(200);
  });
});

describe('FIU routes — RBAC', () => {
  it('generate requires compliance.fiuReport.generate', async () => {
    asAdmin(['X'], ['compliance.fiuReport.view']);
    expect((await request(app).post('/admin/compliance/fiu/draft-reports').send({ reportType: 'STR', scopeType: 'CASE', caseId: UUID })).status).toBe(403);
    asAdmin(['X'], ['compliance.fiuReport.generate']);
    expect((await request(app).post('/admin/compliance/fiu/draft-reports').send({ reportType: 'STR', scopeType: 'CASE', caseId: UUID })).status).toBe(201);
  });
  it('validate / export require their permissions', async () => {
    asAdmin(['X'], ['compliance.fiuReport.view']);
    expect((await request(app).post(`/admin/compliance/fiu/draft-reports/${UUID}/validate`)).status).toBe(403);
    asAdmin(['X'], ['compliance.fiuReport.validate']);
    expect((await request(app).post(`/admin/compliance/fiu/draft-reports/${UUID}/validate`)).status).toBe(200);
    asAdmin(['X'], ['compliance.fiuReport.view']);
    expect((await request(app).get(`/admin/compliance/fiu/draft-reports/${UUID}/export`)).status).toBe(403);
    asAdmin(['X'], ['compliance.fiuReport.export']);
    expect((await request(app).get(`/admin/compliance/fiu/draft-reports/${UUID}/export`)).status).toBe(200);
  });
  it('SUPER_ADMIN bypasses', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/admin/compliance/fiu/draft-reports')).status).toBe(200);
    expect((await request(app).get('/admin/tax/rules')).status).toBe(200);
  });
});
