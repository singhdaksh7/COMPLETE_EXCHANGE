import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

/**
 * Route-level RBAC tests for the Stage 5 user-profile aggregate.
 *  - adminAuthenticate is mocked (no admin → 401).
 *  - The RBAC lookup is mocked so the REAL adminAuthorize runs, proving each
 *    route's permission gate (users.view).
 *  - The service is stubbed (no DB). We assert the controller passes the right
 *    `viewer` (compliance gating) through to the service.
 */

const { state, getProfile, getSection } = vi.hoisted(() => ({
  state: {
    admin: null as { id: string; sessionId: string } | null,
    roles: [] as string[],
    permissions: [] as string[],
  },
  getProfile: vi.fn(),
  getSection: vi.fn(),
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

vi.mock('../../src/modules/admin-user-profile/admin-user-profile.service', () => ({
  adminUserProfileService: {
    getProfile: getProfile,
    getSection: getSection,
  },
}));

import { adminUserProfileRouter } from '../../src/modules/admin-user-profile/admin-user-profile.routes';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/users', adminUserProfileRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const UID = '11111111-1111-4111-8111-111111111111';

function asAdmin(roles: string[], permissions: string[]): void {
  state.admin = { id: 'admin-1', sessionId: 'sess-1' };
  state.roles = roles;
  state.permissions = permissions;
}

beforeEach(() => {
  state.admin = null;
  state.roles = [];
  state.permissions = [];
  getProfile.mockReset().mockResolvedValue({ ok: true });
  getSection.mockReset().mockResolvedValue({ items: [], nextCursor: null });
});

describe('admin user-profile routes — authentication', () => {
  it('GET /users/:id/profile → 401 without an admin', async () => {
    expect((await request(app).get(`/users/${UID}/profile`)).status).toBe(401);
  });
});

describe('admin user-profile routes — RBAC', () => {
  it('profile requires users.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get(`/users/${UID}/profile`)).status).toBe(403);
    asAdmin(['X'], ['users.view']);
    expect((await request(app).get(`/users/${UID}/profile`)).status).toBe(200);
  });

  it('section drill-down requires users.view', async () => {
    asAdmin(['X'], []);
    expect((await request(app).get(`/users/${UID}/profile/sections/orders`)).status).toBe(403);
    asAdmin(['X'], ['users.view']);
    expect((await request(app).get(`/users/${UID}/profile/sections/orders`)).status).toBe(200);
  });

  it('rejects an unknown section name', async () => {
    asAdmin(['X'], ['users.view']);
    expect((await request(app).get(`/users/${UID}/profile/sections/passwords`)).status).toBe(422);
  });

  it('compliance sections are hidden unless caller has compliance.view', async () => {
    asAdmin(['X'], ['users.view']);
    await request(app).get(`/users/${UID}/profile`);
    expect(getProfile).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({ complianceVisible: false }),
      expect.anything(),
    );

    asAdmin(['X'], ['users.view', 'compliance.view']);
    await request(app).get(`/users/${UID}/profile`);
    expect(getProfile).toHaveBeenLastCalledWith(
      UID,
      expect.objectContaining({ complianceVisible: true }),
      expect.anything(),
    );
  });

  it('SUPER_ADMIN sees compliance and may revoke/manage notes', async () => {
    asAdmin(['SUPER_ADMIN'], []);
    await request(app).get(`/users/${UID}/profile`);
    expect(getProfile).toHaveBeenLastCalledWith(
      UID,
      { complianceVisible: true, canRevokeSessions: true, canManageNotes: true },
      expect.anything(),
    );
  });
});
