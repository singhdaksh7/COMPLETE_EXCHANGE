import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const { state, review } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
  review: vi.fn(),
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

vi.mock('../../src/modules/security/audit-review.service', () => ({
  auditReviewService: { review },
}));

import { adminSecurityRouter } from '../../src/modules/security/security.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/security', adminSecurityRouter);
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
  review.mockReset().mockResolvedValue({ items: [], nextCursor: null, summary: { high: 0, medium: 0, low: 0, total: 0 } });
});

describe('audit-review route — RBAC (audit.view OR operations.view)', () => {
  it('401 without an admin', async () => {
    expect((await request(app).get('/security/audit-review')).status).toBe(401);
  });

  it('403 without a qualifying permission', async () => {
    asAdmin(['X'], ['users.view']);
    expect((await request(app).get('/security/audit-review')).status).toBe(403);
  });

  it('200 with audit.view', async () => {
    asAdmin(['X'], ['audit.view']);
    expect((await request(app).get('/security/audit-review')).status).toBe(200);
  });

  it('200 with operations.view', async () => {
    asAdmin(['X'], ['operations.view']);
    expect((await request(app).get('/security/audit-review')).status).toBe(200);
  });

  it('SUPER_ADMIN bypasses the permission check', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    expect((await request(app).get('/security/audit-review')).status).toBe(200);
  });
});

describe('audit-review route — query validation', () => {
  beforeEach(() => asAdmin(['SUPER_ADMIN'], []));

  it('rejects an invalid riskLevel', async () => {
    const res = await request(app).get('/security/audit-review?riskLevel=EXTREME');
    expect(res.status).toBe(422);
  });

  it('rejects a non-uuid adminId', async () => {
    const res = await request(app).get('/security/audit-review?adminId=not-a-uuid');
    expect(res.status).toBe(422);
  });

  it('passes parsed filters through to the service', async () => {
    const res = await request(app).get('/security/audit-review?riskLevel=HIGH&action=withdrawal&limit=10');
    expect(res.status).toBe(200);
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ riskLevel: 'HIGH', action: 'withdrawal', limit: 10 }),
    );
  });
});
