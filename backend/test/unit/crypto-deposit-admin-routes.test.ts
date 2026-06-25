import { describe, it, expect } from 'vitest';
import express, { type Express, type Router } from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { adminCryptoDepositRouter } from '../../src/modules/crypto-deposit/crypto-deposit.admin.routes';
import { adminAuthenticate } from '../../src/middleware/admin-authenticate';
import { errorHandler } from '../../src/middleware/error-handler';

/** Ordered handler references registered for a method+path on a router. */
function routeHandlers(router: Router, method: string, path: string): unknown[] {
  const stack = (
    router as unknown as {
      stack: Array<{
        route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> };
      }>;
    }
  ).stack;
  const layer = stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  return layer?.route ? layer.route.stack.map((s) => s.handle) : [];
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/admin/crypto', adminCryptoDepositRouter);
  app.use(errorHandler);
  return app;
}

describe('admin crypto-deposit routes are RBAC-protected', () => {
  const app = buildApp();
  const id = randomUUID();

  it('every admin route is wired behind adminAuthenticate', () => {
    expect(routeHandlers(adminCryptoDepositRouter, 'get', '/deposits')).toContain(adminAuthenticate);
    expect(routeHandlers(adminCryptoDepositRouter, 'get', '/deposits/:id')).toContain(adminAuthenticate);
    expect(routeHandlers(adminCryptoDepositRouter, 'post', '/deposits/:id/recheck')).toContain(adminAuthenticate);
  });

  it('recheck has an authorization layer between authenticate and the controller', () => {
    const handlers = routeHandlers(adminCryptoDepositRouter, 'post', '/deposits/:id/recheck');
    // adminAuthenticate + adminAuthorize('operations.view') + validate + controller.
    expect(handlers.length).toBeGreaterThanOrEqual(4);
    expect(handlers.indexOf(adminAuthenticate)).toBe(0);
  });

  it('rejects an unauthenticated list request with 401', async () => {
    const res = await request(app).get('/admin/crypto/deposits');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated recheck request with 401', async () => {
    const res = await request(app).post(`/admin/crypto/deposits/${id}/recheck`);
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated detail request with 401', async () => {
    const res = await request(app).get(`/admin/crypto/deposits/${id}`);
    expect(res.status).toBe(401);
  });
});
