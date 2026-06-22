import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/** Route-level RBAC tests for the Stage 5.4 evidence-pack + retention surface. */

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

vi.mock('../../src/modules/compliance/evidence.service', () => ({
  evidenceService: {
    generate: vi.fn(async () => ({ id: 'pack-1', itemCount: 1 })),
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    get: vi.fn(async () => ({ id: 'pack-1' })),
    export: vi.fn(async () => ({ label: 'x' })),
    listExportEvents: vi.fn(async () => ({ items: [], nextCursor: null })),
  },
}));

vi.mock('../../src/modules/compliance/retention.service', () => ({
  retentionService: {
    listPolicies: vi.fn(async () => []),
    upsertPolicy: vi.fn(async () => ({ id: 'p1' })),
    listReviews: vi.fn(async () => ({ items: [], nextCursor: null })),
    setReviewStatus: vi.fn(async () => ({ id: 'r1' })),
  },
}));

import { adminEvidenceRouter } from '../../src/modules/compliance/evidence.admin.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/admin/compliance', adminEvidenceRouter);
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

describe('evidence-pack routes — auth + RBAC', () => {
  it('list requires authentication', async () => {
    expect((await request(app).get('/admin/compliance/evidence-packs')).status).toBe(401);
  });

  it('list requires compliance.evidencePack.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/evidence-packs')).status).toBe(403);
    asAdmin(['X'], ['compliance.evidencePack.view']);
    expect((await request(app).get('/admin/compliance/evidence-packs')).status).toBe(200);
  });

  it('generate requires compliance.evidencePack.generate (view is not enough)', async () => {
    asAdmin(['X'], ['compliance.evidencePack.view']);
    expect((await request(app).post('/admin/compliance/evidence-packs').send({ packType: 'USER_KYC', userId: UUID })).status).toBe(403);
    asAdmin(['X'], ['compliance.evidencePack.generate']);
    expect((await request(app).post('/admin/compliance/evidence-packs').send({ packType: 'USER_KYC', userId: UUID })).status).toBe(201);
  });

  it('export requires compliance.evidencePack.export', async () => {
    asAdmin(['X'], ['compliance.evidencePack.view']);
    expect((await request(app).get(`/admin/compliance/evidence-packs/${UUID}/export`)).status).toBe(403);
    asAdmin(['X'], ['compliance.evidencePack.export']);
    expect((await request(app).get(`/admin/compliance/evidence-packs/${UUID}/export`)).status).toBe(200);
  });
});

describe('retention + export-event routes — RBAC', () => {
  it('retention policies view requires compliance.retention.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/retention/policies')).status).toBe(403);
    asAdmin(['X'], ['compliance.retention.view']);
    expect((await request(app).get('/admin/compliance/retention/policies')).status).toBe(200);
  });

  it('upsert policy requires compliance.retention.manage', async () => {
    asAdmin(['X'], ['compliance.retention.view']);
    expect((await request(app).post('/admin/compliance/retention/policies').send({ recordType: 'KYC', retentionYears: 5 })).status).toBe(403);
    asAdmin(['X'], ['compliance.retention.manage']);
    expect((await request(app).post('/admin/compliance/retention/policies').send({ recordType: 'KYC', retentionYears: 5 })).status).toBe(201);
  });

  it('review status requires compliance.retention.manage', async () => {
    asAdmin(['X'], ['compliance.retention.view']);
    expect((await request(app).post(`/admin/compliance/retention/reviews/${UUID}/status`).send({ status: 'REVIEWED' })).status).toBe(403);
    asAdmin(['X'], ['compliance.retention.manage']);
    expect((await request(app).post(`/admin/compliance/retention/reviews/${UUID}/status`).send({ status: 'REVIEWED' })).status).toBe(200);
  });

  it('export events require compliance.exportEvent.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/admin/compliance/exports/events')).status).toBe(403);
    asAdmin(['X'], ['compliance.exportEvent.view']);
    expect((await request(app).get('/admin/compliance/exports/events')).status).toBe(200);
  });

  it('SUPER_ADMIN bypasses all evidence/retention checks', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/admin/compliance/evidence-packs')).status).toBe(200);
    expect((await request(app).post('/admin/compliance/evidence-packs').send({ packType: 'USER_KYC', userId: UUID })).status).toBe(201);
    expect((await request(app).get('/admin/compliance/retention/policies')).status).toBe(200);
  });
});
