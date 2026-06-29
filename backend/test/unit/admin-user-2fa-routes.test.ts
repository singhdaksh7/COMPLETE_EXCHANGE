import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

// Inject an authenticated admin so we exercise the RBAC (adminAuthorize) layer,
// not the JWT layer.
vi.mock('../../src/middleware/admin-authenticate', () => ({
  adminAuthenticate: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { admin?: unknown }).admin = { id: 'admin-1', sessionId: 's' };
    next();
  },
}));

// adminAuthorize consults this for the caller's roles/permissions.
vi.mock('../../src/modules/admin-rbac/admin-rbac.service', () => ({
  adminRbacService: {
    getAdminPermissions: vi.fn(),
  },
}));

import { adminUserProfileRouter } from '../../src/modules/admin-user-profile/admin-user-profile.routes';
import { errorHandler } from '../../src/middleware/error-handler';
import { adminRbacService } from '../../src/modules/admin-rbac/admin-rbac.service';

const rbac = vi.mocked(adminRbacService);

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/users', adminUserProfileRouter);
  app.use(errorHandler);
  return app;
}

describe('admin user 2FA reset is permission-gated (users.security.manage)', () => {
  const app = buildApp();
  const userId = randomUUID();

  beforeEach(() => vi.clearAllMocks());

  it('rejects an admin WITHOUT users.security.manage with 403', async () => {
    rbac.getAdminPermissions.mockResolvedValue({ roles: [], permissions: [] });
    const res = await request(app).post(`/users/${userId}/2fa/reset`).send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false });
  });

  it('rejects a status view WITHOUT the permission with 403', async () => {
    rbac.getAdminPermissions.mockResolvedValue({ roles: [], permissions: [] });
    const res = await request(app).get(`/users/${userId}/2fa`);
    expect(res.status).toBe(403);
  });

  it('passes the RBAC gate for SUPER_ADMIN (permission layer allows)', async () => {
    // SUPER_ADMIN bypasses the permission check; we only assert it is NOT a 403
    // from the RBAC layer (downstream service/DB is out of scope for this unit).
    rbac.getAdminPermissions.mockResolvedValue({
      roles: ['SUPER_ADMIN'],
      permissions: [],
    });
    const res = await request(app).post(`/users/${userId}/2fa/reset`).send({});
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
