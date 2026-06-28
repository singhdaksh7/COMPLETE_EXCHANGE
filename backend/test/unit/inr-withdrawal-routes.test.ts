import { describe, it, expect, vi } from 'vitest';
import express, { type Express, type Router } from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

// Keep the test Redis-free: the real rate limiters use a Redis store, and the
// idempotency middleware also touches Redis. We replace them with distinct
// pass-through references so we can still assert they are wired into the routes.
vi.mock('../../src/middleware/rate-limit', () => ({
  sensitiveRateLimiter: vi.fn((_req, _res, next) => next()),
  adminSensitiveRateLimiter: vi.fn((_req, _res, next) => next()),
  authRateLimiter: vi.fn((_req, _res, next) => next()),
  globalRateLimiter: vi.fn((_req, _res, next) => next()),
}));
vi.mock('../../src/middleware/idempotency', () => ({
  idempotency: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { inrWithdrawalRouter } from '../../src/modules/inr-withdrawal/inr-withdrawal.routes';
import { adminInrWithdrawalRouter } from '../../src/modules/inr-withdrawal/inr-withdrawal.admin.routes';
import { authenticate } from '../../src/middleware/authenticate';
import { adminAuthenticate } from '../../src/middleware/admin-authenticate';
import { errorHandler } from '../../src/middleware/error-handler';
import {
  sensitiveRateLimiter,
  adminSensitiveRateLimiter,
} from '../../src/middleware/rate-limit';

/** Ordered handler references registered for a method+path on a router. */
function routeHandlers(router: Router, method: string, path: string): unknown[] {
  const stack = (
    router as unknown as {
      stack: Array<{
        route?: {
          path: string;
          methods: Record<string, boolean>;
          stack: Array<{ handle: unknown }>;
        };
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
  app.use('/inr/withdrawals', inrWithdrawalRouter);
  app.use('/admin/inr/withdrawals', adminInrWithdrawalRouter);
  app.use(errorHandler);
  return app;
}

describe('INR withdrawal user routes are auth + feature-gated + rate-limited', () => {
  const app = buildApp();

  it('wires authenticate + sensitiveRateLimiter on the create route', () => {
    const handlers = routeHandlers(inrWithdrawalRouter, 'post', '/');
    expect(handlers).toContain(authenticate);
    expect(handlers).toContain(sensitiveRateLimiter);
    // authenticate runs first so an unauthenticated call never reaches the
    // limiter / feature gate / controller.
    expect(handlers.indexOf(authenticate)).toBe(0);
  });

  it('requires auth on every user route', () => {
    expect(routeHandlers(inrWithdrawalRouter, 'get', '/')).toContain(authenticate);
    expect(routeHandlers(inrWithdrawalRouter, 'get', '/:id')).toContain(authenticate);
  });

  it('rejects an unauthenticated withdrawal request with 401', async () => {
    const res = await request(app)
      .post('/inr/withdrawals')
      .send({ amount: '500', method: 'UPI', upiId: 'a@okhdfc' });
    expect(res.status).toBe(401);
    // No raw error leakage — the envelope carries a stable code only.
    expect(res.body).toMatchObject({ success: false });
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|at Object|node_modules/i);
  });

  it('rejects an unauthenticated history list with 401', async () => {
    const res = await request(app).get('/inr/withdrawals');
    expect(res.status).toBe(401);
  });
});

describe('INR withdrawal admin routes are RBAC-protected + rate-limited', () => {
  const app = buildApp();
  const id = randomUUID();

  it('wires adminAuthenticate on every admin route', () => {
    expect(routeHandlers(adminInrWithdrawalRouter, 'get', '/')).toContain(adminAuthenticate);
    expect(routeHandlers(adminInrWithdrawalRouter, 'get', '/:id')).toContain(adminAuthenticate);
    expect(routeHandlers(adminInrWithdrawalRouter, 'post', '/:id/approve')).toContain(adminAuthenticate);
    expect(routeHandlers(adminInrWithdrawalRouter, 'post', '/:id/reject')).toContain(adminAuthenticate);
    expect(routeHandlers(adminInrWithdrawalRouter, 'post', '/:id/mark-paid')).toContain(adminAuthenticate);
  });

  it('throttles the sensitive mutations with the admin-sensitive limiter', () => {
    for (const p of ['/:id/approve', '/:id/reject', '/:id/mark-paid']) {
      const handlers = routeHandlers(adminInrWithdrawalRouter, 'post', p);
      expect(handlers).toContain(adminSensitiveRateLimiter);
      // adminAuthenticate runs before the limiter/controller.
      expect(handlers.indexOf(adminAuthenticate)).toBe(0);
    }
  });

  it('rejects unauthenticated admin actions with 401', async () => {
    for (const p of [`/${id}/approve`, `/${id}/reject`, `/${id}/mark-paid`]) {
      const res = await request(app).post(`/admin/inr/withdrawals${p}`).send({});
      expect(res.status).toBe(401);
    }
    const list = await request(app).get('/admin/inr/withdrawals');
    expect(list.status).toBe(401);
  });
});
