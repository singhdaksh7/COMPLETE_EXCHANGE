import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const { state, getCommandCenter } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
  getCommandCenter: vi.fn(),
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

vi.mock('../../src/modules/operations/command-center.service', () => ({
  commandCenterService: { getCommandCenter },
}));

import { adminCommandCenterRouter } from '../../src/modules/operations/command-center.admin.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/ops', adminCommandCenterRouter);
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
  getCommandCenter.mockReset().mockResolvedValue({ cards: {}, meta: {} });
});

describe('command center route', () => {
  it('401 without an admin', async () => {
    expect((await request(app).get('/ops/command-center')).status).toBe(401);
  });

  it('requires operations.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/ops/command-center')).status).toBe(403);
    asAdmin(['X'], ['operations.view']);
    expect((await request(app).get('/ops/command-center')).status).toBe(200);
  });

  it('SUPER_ADMIN bypasses the permission check', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/ops/command-center')).status).toBe(200);
  });
});
