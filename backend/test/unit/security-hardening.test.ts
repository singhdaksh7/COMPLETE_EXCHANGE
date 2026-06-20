import { describe, it, expect } from 'vitest';
import type { Request, Response, Router } from 'express';
import {
  authRateLimiter,
  sensitiveRateLimiter,
  globalRateLimiter,
} from '../../src/middleware/rate-limit';
import { authRouter } from '../../src/modules/auth/auth.routes';
import { adminRbacRouter } from '../../src/modules/admin-rbac/admin-rbac.routes';
import { withdrawalRouter } from '../../src/modules/withdrawal/withdrawal.routes';
import { depositRouter } from '../../src/modules/deposit/deposit.routes';
import { version } from '../../src/modules/health/health.controller';

/** Return the ordered handler references registered for a method+path. */
function routeHandlers(router: Router, method: string, path: string): unknown[] {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> } }> }).stack;
  const layer = stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  return layer?.route ? layer.route.stack.map((s) => s.handle) : [];
}

describe('rate limiters are defined', () => {
  it('exposes three distinct Redis-backed limiters', () => {
    expect(typeof authRateLimiter).toBe('function');
    expect(typeof sensitiveRateLimiter).toBe('function');
    expect(typeof globalRateLimiter).toBe('function');
    expect(authRateLimiter).not.toBe(sensitiveRateLimiter);
  });
});

describe('auth endpoints carry the auth rate limiter', () => {
  it('user login is rate-limited', () => {
    expect(routeHandlers(authRouter, 'post', '/login')).toContain(authRateLimiter);
  });
  it('password reset is rate-limited', () => {
    expect(routeHandlers(authRouter, 'post', '/reset-password')).toContain(authRateLimiter);
  });
  it('forgot-password is rate-limited', () => {
    expect(routeHandlers(authRouter, 'post', '/forgot-password')).toContain(authRateLimiter);
  });
});

describe('admin login carries the auth rate limiter', () => {
  it('admin login is rate-limited', () => {
    expect(routeHandlers(adminRbacRouter, 'post', '/auth/login')).toContain(authRateLimiter);
  });
});

describe('money-movement submissions carry the sensitive rate limiter', () => {
  it('withdrawal request is rate-limited', () => {
    expect(routeHandlers(withdrawalRouter, 'post', '/')).toContain(sensitiveRateLimiter);
  });
  it('manual INR deposit submit is rate-limited', () => {
    expect(routeHandlers(depositRouter, 'post', '/manual')).toContain(sensitiveRateLimiter);
  });
});

describe('health/version does not expose secrets', () => {
  it('returns only safe build metadata', () => {
    let payload: unknown;
    const res = {
      status: () => res,
      json: (body: unknown) => {
        payload = body;
        return res;
      },
    } as unknown as Response;

    version({} as Request, res);

    const env = (payload as { data: Record<string, unknown> }).data;
    // Only safe build/version fields are present.
    expect(Object.keys(env).sort()).toEqual(['node', 'service', 'timestamp', 'version']);

    // No secret-like material anywhere in the response.
    const serialized = JSON.stringify(payload).toLowerCase();
    for (const needle of [
      'secret',
      'password',
      'token',
      'jwt',
      'postgres',
      'redis',
      'apikey',
      'api_key',
      'privatekey',
      'rpc',
    ]) {
      expect(serialized).not.toContain(needle);
    }
  });
});
