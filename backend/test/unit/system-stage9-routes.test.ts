import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const { state, getSystemReadiness, backupStatus, monitoringStatus, guardrailsStatus } =
  vi.hoisted(() => ({
    state: {
      admin: null as { id: string; sessionId: string } | null,
      roles: [] as string[],
      permissions: [] as string[],
    },
    getSystemReadiness: vi.fn(),
    backupStatus: vi.fn(),
    monitoringStatus: vi.fn(),
    guardrailsStatus: vi.fn(),
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

// Stub the existing system.service so importing the controller does not drag in
// the heavy operational dependency graph (scanner, prisma, etc.).
vi.mock('../../src/modules/system/system.service', () => ({
  systemService: {
    overview: vi.fn(),
    health: vi.fn(),
    queues: vi.fn(),
    scanner: vi.fn(),
    mail: vi.fn(),
    riskAlerts: vi.fn(),
  },
}));
vi.mock('../../src/modules/system/readiness.service', () => ({ getSystemReadiness }));
vi.mock('../../src/modules/system/backup.service', () => ({ backupService: { status: backupStatus } }));
vi.mock('../../src/modules/system/monitoring.service', () => ({ monitoringService: { status: monitoringStatus } }));
vi.mock('../../src/modules/system/guardrails.service', () => ({ guardrailsService: { status: guardrailsStatus } }));

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
  getSystemReadiness.mockReset().mockResolvedValue({ status: 'healthy', checks: [] });
  backupStatus.mockReset().mockReturnValue({ status: 'ok', warnings: [] });
  monitoringStatus.mockReset().mockReturnValue({ status: 'ok', alerts: [] });
  guardrailsStatus.mockReset().mockReturnValue({ guardrails: [] });
});

const STAGE9_PATHS = [
  '/system/readiness',
  '/system/backup-status',
  '/system/monitoring',
  '/system/guardrails',
];

describe('Stage 9 system routes — RBAC (operations.view OR system.view)', () => {
  for (const path of STAGE9_PATHS) {
    it(`${path} → 401 without an admin`, async () => {
      expect((await request(app).get(path)).status).toBe(401);
    });

    it(`${path} → 403 without a qualifying permission`, async () => {
      asAdmin(['X'], ['something.else']);
      expect((await request(app).get(path)).status).toBe(403);
    });

    it(`${path} → 200 with operations.view`, async () => {
      asAdmin(['X'], ['operations.view']);
      expect((await request(app).get(path)).status).toBe(200);
    });

    it(`${path} → 200 with system.view`, async () => {
      asAdmin(['X'], ['system.view']);
      expect((await request(app).get(path)).status).toBe(200);
    });

    it(`${path} → 200 for SUPER_ADMIN with no explicit grant`, async () => {
      asAdmin(['SUPER_ADMIN'], []);
      expect((await request(app).get(path)).status).toBe(200);
    });
  }
});
