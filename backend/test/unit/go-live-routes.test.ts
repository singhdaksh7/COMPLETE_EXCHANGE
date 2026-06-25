import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const { state, goLiveReadiness } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
  goLiveReadiness: vi.fn(),
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

// Stub all system services so importing the controller stays light.
vi.mock('../../src/modules/system/system.service', () => ({
  systemService: {
    overview: vi.fn(), health: vi.fn(), queues: vi.fn(),
    scanner: vi.fn(), mail: vi.fn(), riskAlerts: vi.fn(),
  },
}));
vi.mock('../../src/modules/system/readiness.service', () => ({ getSystemReadiness: vi.fn() }));
vi.mock('../../src/modules/system/backup.service', () => ({ backupService: { status: vi.fn() } }));
vi.mock('../../src/modules/system/monitoring.service', () => ({ monitoringService: { status: vi.fn() } }));
vi.mock('../../src/modules/system/guardrails.service', () => ({ guardrailsService: { status: vi.fn() } }));
vi.mock('../../src/modules/system/go-live.service', () => ({ goLiveService: { readiness: goLiveReadiness } }));

import { adminSystemRouter } from '../../src/modules/system/system.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
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
  goLiveReadiness.mockReset().mockReturnValue({ status: 'warning', sections: [], checklist: [], warnings: [] });
});

const PATH = '/system/go-live-readiness';

describe('go-live-readiness route — RBAC (operations.view OR system.view)', () => {
  it('401 without an admin', async () => {
    expect((await request(app).get(PATH)).status).toBe(401);
  });

  it('403 without a qualifying permission', async () => {
    asAdmin(['X'], ['something.else']);
    expect((await request(app).get(PATH)).status).toBe(403);
  });

  it('200 with operations.view', async () => {
    asAdmin(['X'], ['operations.view']);
    expect((await request(app).get(PATH)).status).toBe(200);
  });

  it('200 with system.view', async () => {
    asAdmin(['X'], ['system.view']);
    expect((await request(app).get(PATH)).status).toBe(200);
  });

  it('SUPER_ADMIN bypasses the permission check', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    const res = await request(app).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
