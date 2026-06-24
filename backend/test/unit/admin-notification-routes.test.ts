import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const { state, svc } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
  svc: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
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

vi.mock('../../src/modules/admin-notification/admin-notification.service', () => ({
  adminNotificationService: svc,
}));

import { adminNotificationCenterRouter } from '../../src/modules/admin-notification/admin-notification.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/admin-notifications', adminNotificationCenterRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const NID = '11111111-1111-4111-8111-111111111111';

function asAdmin(roles: string[], permissions: string[]): void {
  state.admin = { id: 'admin-1', sessionId: 'sess-1' };
  state.roles = roles;
  state.permissions = permissions;
}

beforeEach(() => {
  state.admin = null;
  state.roles = [];
  state.permissions = [];
  svc.list.mockReset().mockResolvedValue({ items: [], nextCursor: null, unread: 0 });
  svc.markRead.mockReset().mockResolvedValue({ updated: true });
  svc.markAllRead.mockReset().mockResolvedValue({ updated: 0 });
});

describe('admin notification center routes', () => {
  it('list 401 without admin, 403 without operations.view, 200 with', async () => {
    expect((await request(app).get('/admin-notifications')).status).toBe(401);
    asAdmin(['X'], []);
    expect((await request(app).get('/admin-notifications')).status).toBe(403);
    asAdmin(['X'], ['operations.view']);
    expect((await request(app).get('/admin-notifications')).status).toBe(200);
  });

  it('mark one read requires operations.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).patch(`/admin-notifications/${NID}/read`)).status).toBe(403);
    asAdmin(['X'], ['operations.view']);
    expect((await request(app).patch(`/admin-notifications/${NID}/read`)).status).toBe(200);
  });

  it('mark-all read requires operations.view and is reachable (not shadowed by :id)', async () => {
    asAdmin(['X'], ['operations.view']);
    const res = await request(app).patch('/admin-notifications/read-all');
    expect(res.status).toBe(200);
    expect(svc.markAllRead).toHaveBeenCalled();
    expect(svc.markRead).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid id', async () => {
    asAdmin(['X'], ['operations.view']);
    expect((await request(app).patch('/admin-notifications/not-a-uuid/read')).status).toBe(422);
  });

  it('SUPER_ADMIN bypasses', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/admin-notifications')).status).toBe(200);
  });
});
