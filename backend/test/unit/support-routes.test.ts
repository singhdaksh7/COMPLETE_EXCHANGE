import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const { state, svc } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
  svc: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), addNote: vi.fn() },
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

vi.mock('../../src/modules/support/support.service', () => ({ supportService: svc }));

import { adminSupportRouter } from '../../src/modules/support/support.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/support', adminSupportRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const TID = '11111111-1111-4111-8111-111111111111';

function asAdmin(roles: string[], permissions: string[]): void {
  state.admin = { id: 'admin-1', sessionId: 'sess-1' };
  state.roles = roles;
  state.permissions = permissions;
}

beforeEach(() => {
  state.admin = null;
  state.roles = [];
  state.permissions = [];
  svc.list.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  svc.get.mockReset().mockResolvedValue({ id: TID, notes: [] });
  svc.create.mockReset().mockResolvedValue({ id: TID, notes: [] });
  svc.update.mockReset().mockResolvedValue({ id: TID, notes: [] });
  svc.addNote.mockReset().mockResolvedValue({ id: TID, notes: [] });
});

describe('support ticket routes — RBAC', () => {
  it('list 401 without admin, 403 without support.view, 200 with', async () => {
    expect((await request(app).get('/support/tickets')).status).toBe(401);
    asAdmin(['X'], []);
    expect((await request(app).get('/support/tickets')).status).toBe(403);
    asAdmin(['X'], ['support.view']);
    expect((await request(app).get('/support/tickets')).status).toBe(200);
  });

  it('create requires support.manage (view is not enough)', async () => {
    asAdmin(['X'], ['support.view']);
    expect((await request(app).post('/support/tickets').send({ subject: 'Need help here' })).status).toBe(403);
    asAdmin(['X'], ['support.manage']);
    expect((await request(app).post('/support/tickets').send({ subject: 'Need help here' })).status).toBe(201);
  });

  it('update requires support.manage', async () => {
    asAdmin(['X'], ['support.view']);
    expect((await request(app).patch(`/support/tickets/${TID}`).send({ status: 'RESOLVED' })).status).toBe(403);
    asAdmin(['X'], ['support.manage']);
    expect((await request(app).patch(`/support/tickets/${TID}`).send({ status: 'RESOLVED' })).status).toBe(200);
  });

  it('add note requires support.manage', async () => {
    asAdmin(['X'], ['support.view']);
    expect((await request(app).post(`/support/tickets/${TID}/notes`).send({ body: 'hi' })).status).toBe(403);
    asAdmin(['X'], ['support.manage']);
    expect((await request(app).post(`/support/tickets/${TID}/notes`).send({ body: 'hi' })).status).toBe(201);
  });

  it('rejects a too-short subject', async () => {
    asAdmin(['X'], ['support.manage']);
    expect((await request(app).post('/support/tickets').send({ subject: 'a' })).status).toBe(422);
  });

  it('SUPER_ADMIN bypasses all gates', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/support/tickets')).status).toBe(200);
    expect((await request(app).post('/support/tickets').send({ subject: 'Need help here' })).status).toBe(201);
  });
});
