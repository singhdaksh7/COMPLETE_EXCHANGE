import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/** Route-level RBAC tests for the Stage 5.7 AML policy + workspace surface. */

const { state } = vi.hoisted(() => ({
  state: { admin: null as { id: string; sessionId: string } | null, roles: [] as string[], permissions: [] as string[] },
}));

vi.mock('../../src/middleware/admin-authenticate', () => ({
  adminAuthenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!state.admin) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }); return; }
    req.admin = state.admin; next();
  },
}));
vi.mock('../../src/modules/admin-rbac/admin-rbac.service', () => ({
  adminRbacService: { getAdminPermissions: vi.fn(async () => ({ roles: state.roles, permissions: state.permissions })) },
}));
vi.mock('../../src/modules/compliance/aml.service', () => ({
  amlService: {
    listPolicies: vi.fn(async () => []), createPolicy: vi.fn(async () => ({ id: 'p' })), getPolicy: vi.fn(async () => ({ id: 'p' })),
    activate: vi.fn(async () => ({ id: 'p' })), addRule: vi.fn(async () => ({ id: 'r' })), updateRule: vi.fn(async () => ({ id: 'r' })),
    evaluate: vi.fn(async () => ({ matchedCount: 0, reviewOnly: true })),
  },
}));
vi.mock('../../src/modules/compliance/workspace.service', () => ({
  workspaceService: {
    summary: vi.fn(async () => ({})), list: vi.fn(async () => ({ items: [], nextCursor: null })), createTask: vi.fn(async () => ({ id: 't' })),
    getTask: vi.fn(async () => ({ id: 't' })), assign: vi.fn(async () => ({ id: 't' })), setStatus: vi.fn(async () => ({ id: 't' })),
    addComment: vi.fn(async () => ({ id: 't' })), events: vi.fn(async () => []),
    listTemplates: vi.fn(async () => []), createTemplate: vi.fn(async () => ({ id: 'tpl' })),
    getTaskChecklist: vi.fn(async () => ({})), saveChecklist: vi.fn(async () => ({})),
    listApprovals: vi.fn(async () => ({ items: [], nextCursor: null })), createApproval: vi.fn(async () => ({ id: 'ap' })),
    getApproval: vi.fn(async () => ({ id: 'ap' })), decideApproval: vi.fn(async () => ({ id: 'ap' })),
  },
}));

import { adminAmlRouter } from '../../src/modules/compliance/aml.admin.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/admin/compliance', adminAmlRouter);
  app.use(errorHandler);
  return app;
}
const app = buildApp();
const UUID = '11111111-1111-1111-1111-111111111111';
function asAdmin(roles: string[], permissions: string[]): void { state.admin = { id: 'admin-1', sessionId: 's' }; state.roles = roles; state.permissions = permissions; }
beforeEach(() => { state.admin = null; state.roles = []; state.permissions = []; });

describe('AML policy routes — RBAC', () => {
  it('list requires compliance.amlPolicy.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/aml/policies')).status).toBe(403);
    asAdmin(['X'], ['compliance.amlPolicy.view']);
    expect((await request(app).get('/admin/compliance/aml/policies')).status).toBe(200);
  });
  it('create requires compliance.amlPolicy.manage', async () => {
    asAdmin(['X'], ['compliance.amlPolicy.view']);
    expect((await request(app).post('/admin/compliance/aml/policies').send({ version: 'v1', name: 'Baseline' })).status).toBe(403);
    asAdmin(['X'], ['compliance.amlPolicy.manage']);
    expect((await request(app).post('/admin/compliance/aml/policies').send({ version: 'v1', name: 'Baseline' })).status).toBe(201);
  });
  it('activate requires compliance.amlPolicy.activate', async () => {
    asAdmin(['X'], ['compliance.amlPolicy.manage']);
    expect((await request(app).post(`/admin/compliance/aml/policies/${UUID}/activate`)).status).toBe(403);
    asAdmin(['X'], ['compliance.amlPolicy.activate']);
    expect((await request(app).post(`/admin/compliance/aml/policies/${UUID}/activate`)).status).toBe(200);
  });
});

describe('workspace routes — RBAC', () => {
  it('summary requires compliance.workspace.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/workspace/summary')).status).toBe(403);
    asAdmin(['X'], ['compliance.workspace.view']);
    expect((await request(app).get('/admin/compliance/workspace/summary')).status).toBe(200);
  });
  it('task create requires compliance.task.manage', async () => {
    asAdmin(['X'], ['compliance.task.view']);
    expect((await request(app).post('/admin/compliance/workspace/tasks').send({ type: 'KYC_REVIEW', title: 'Review' })).status).toBe(403);
    asAdmin(['X'], ['compliance.task.manage']);
    expect((await request(app).post('/admin/compliance/workspace/tasks').send({ type: 'KYC_REVIEW', title: 'Review' })).status).toBe(201);
  });
  it('approval decide requires compliance.approval.decide', async () => {
    asAdmin(['X'], ['compliance.approval.create']);
    expect((await request(app).post(`/admin/compliance/workspace/approvals/${UUID}/approve`).send({})).status).toBe(403);
    asAdmin(['X'], ['compliance.approval.decide']);
    expect((await request(app).post(`/admin/compliance/workspace/approvals/${UUID}/approve`).send({})).status).toBe(200);
  });
  it('approval create requires compliance.approval.create', async () => {
    asAdmin(['X'], ['compliance.approval.view']);
    expect((await request(app).post('/admin/compliance/workspace/approvals').send({ approvalType: 'FIU_DRAFT_EXPORT', title: 'Export request' })).status).toBe(403);
    asAdmin(['X'], ['compliance.approval.create']);
    expect((await request(app).post('/admin/compliance/workspace/approvals').send({ approvalType: 'FIU_DRAFT_EXPORT', title: 'Export request' })).status).toBe(201);
  });
  it('SUPER_ADMIN bypasses', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/admin/compliance/workspace/summary')).status).toBe(200);
    expect((await request(app).post(`/admin/compliance/aml/policies/${UUID}/activate`)).status).toBe(200);
  });
});
