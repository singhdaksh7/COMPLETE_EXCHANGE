import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/**
 * Route-level RBAC test for the Stage 4A compliance dashboard aggregate.
 *  - adminAuthenticate is mocked (no admin → 401).
 *  - The RBAC lookup is mocked so the REAL adminAuthorize runs, proving the
 *    compliance.view gate.
 *  - The service is stubbed (no DB).
 */

const { state, getDashboard } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
  getDashboard: vi.fn(),
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

vi.mock('../../src/modules/compliance/dashboard.service', () => ({
  dashboardService: { getDashboard },
}));

import { adminComplianceDashboardRouter } from '../../src/modules/compliance/dashboard.admin.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/compliance', adminComplianceDashboardRouter);
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
  getDashboard.mockReset().mockResolvedValue({ cards: {}, queues: {}, meta: {} });
});

describe('compliance dashboard route', () => {
  it('401 without an admin', async () => {
    expect((await request(app).get('/compliance/dashboard')).status).toBe(401);
  });

  it('requires compliance.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get('/compliance/dashboard')).status).toBe(403);
    asAdmin(['X'], ['compliance.view']);
    expect((await request(app).get('/compliance/dashboard')).status).toBe(200);
  });

  it('SUPER_ADMIN bypasses the permission check', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/compliance/dashboard')).status).toBe(200);
  });

  it('rejects an invalid filter value', async () => {
    asAdmin(['X'], ['compliance.view']);
    expect((await request(app).get('/compliance/dashboard?riskLevel=NONSENSE')).status).toBe(422);
  });

  it('passes parsed filters through to the service', async () => {
    asAdmin(['X'], ['compliance.view']);
    await request(app).get('/compliance/dashboard?riskLevel=HIGH&previewLimit=5');
    expect(getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ riskLevel: 'HIGH', previewLimit: 5 }),
      expect.anything(),
    );
  });
});
