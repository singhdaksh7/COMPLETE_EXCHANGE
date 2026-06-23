import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { config } from '../../src/config';
import {
  signAccessToken,
  verifyAccessToken,
  signAdminAccessToken,
  verifyAdminAccessToken,
} from '../../src/lib/jwt';
import {
  helmetMiddleware,
  additionalSecurityHeaders,
} from '../../src/middleware/security';
import { errorHandler } from '../../src/middleware/error-handler';
import { redactSensitive } from '../../src/lib/redaction';

/**
 * Stage 7.0B — security hardening / VAPT-prep regression tests.
 *
 * These lock in the audit-relevant guarantees that are NOT already covered by
 * the existing suites (jwt.test.ts, admin-rbac-baseline.test.ts,
 * workspace-service.test.ts, compliance-types.test.ts, redaction.test.ts,
 * security-hardening.test.ts):
 *   - the user/admin access tokens are mutually non-interchangeable at the
 *     crypto boundary (audience separation) — a user token can never satisfy
 *     the admin verifier and vice-versa;
 *   - expired tokens are rejected;
 *   - the hardened response headers (incl. the new Permissions-Policy) are
 *     actually emitted;
 *   - the central error handler never leaks internal messages/stack traces in
 *     production;
 *   - the structured-log/response redactor scrubs every secret category.
 * All assertions are read-only — they touch no DB, Redis, money movement,
 * scanner, ledger, or FIU/tax logic.
 */

describe('JWT user/admin tokens are not interchangeable (audience separation)', () => {
  it('a USER access token is rejected by the ADMIN verifier', () => {
    const userToken = signAccessToken({ sub: 'u1', sid: 's1', kycTier: 2 });
    expect(() => verifyAdminAccessToken(userToken)).toThrow();
  });

  it('an ADMIN access token is rejected by the USER verifier', () => {
    const adminToken = signAdminAccessToken({ sub: 'a1', sid: 's1' });
    expect(() => verifyAccessToken(adminToken)).toThrow();
  });

  it('an admin token round-trips only through the admin verifier', () => {
    const adminToken = signAdminAccessToken({ sub: 'a1', sid: 's1' });
    const decoded = verifyAdminAccessToken(adminToken);
    expect(decoded.sub).toBe('a1');
    expect(decoded.purpose).toBe('admin_access');
  });

  it('rejects an expired access token', () => {
    const expired = jwt.sign(
      { sub: 'u1', sid: 's1', kycTier: 0, purpose: 'access' },
      config.jwt.accessSecret,
      { algorithm: 'HS256', issuer: 'cex-api', audience: 'cex-api:access', expiresIn: -10 },
    );
    expect(() => verifyAccessToken(expired)).toThrow(/expired|jwt expired/i);
  });

  it('rejects an unsigned (alg=none) token', () => {
    // Forge an alg:none token: header.payload. with empty signature.
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'u1', sid: 's1', purpose: 'access' })}.`;
    expect(() => verifyAccessToken(forged)).toThrow();
  });
});

describe('hardened response headers are emitted', () => {
  // Minimal app exercising only the security middlewares (no DB/Redis), so the
  // assertion is deterministic and validates the Stage 7.0B Permissions-Policy.
  const app = express();
  app.use(helmetMiddleware);
  app.use(additionalSecurityHeaders);
  app.get('/probe', (_req, res) => res.json({ ok: true }));

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/probe');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets a restrictive Permissions-Policy', async () => {
    const res = await request(app).get('/probe');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['permissions-policy']).toContain('geolocation=()');
  });

  it('sets X-Frame-Options and Referrer-Policy (helmet defaults)', async () => {
    const res = await request(app).get('/probe');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  it('does not advertise the framework (no x-powered-by from helmet)', async () => {
    const res = await request(app).get('/probe');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('central error handler does not leak internals in production', () => {
  function invoke(): { status: number; body: Record<string, unknown> } {
    let status = 0;
    let body: Record<string, unknown> = {};
    const res = {
      status(code: number) { status = code; return this; },
      json(payload: Record<string, unknown>) { body = payload; return this; },
    } as unknown as Response;
    const req = { log: { error() {}, warn() {} } } as unknown as Request;
    const boom = new Error('connect ECONNREFUSED 10.0.0.7:5432 secret-dsn-here');
    errorHandler(boom, req, res, () => {});
    return { status, body };
  }

  it('returns a generic message and no stack trace when isProd', () => {
    const original = config.isProd;
    try {
      (config as { isProd: boolean }).isProd = true;
      const { status, body } = invoke();
      expect(status).toBe(500);
      const serialized = JSON.stringify(body);
      expect((body.error as { message: string }).message).toBe('An unexpected error occurred');
      expect(serialized).not.toContain('ECONNREFUSED');
      expect(serialized).not.toContain('secret-dsn-here');
      expect(serialized.toLowerCase()).not.toContain('at object.');
      expect(serialized).not.toContain('.ts:');
    } finally {
      (config as { isProd: boolean }).isProd = original;
    }
  });
});

describe('redactor scrubs every secret category (no secrets in outputs)', () => {
  it('redacts tokens, passwords, keys and connection strings', () => {
    const out = redactSensitive({
      id: 'u1',
      email: 'a@b.com',
      password: 'hunter2',
      passwordHash: '$argon2id$abc',
      accessToken: 'eyJabc',
      refreshToken: 'eyJdef',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      privateKey: '0xdeadbeef',
      apiKey: 'sk_live_123',
      webhookSecret: 'whsec_123',
      databaseUrl: 'postgresql://u:p@h:5432/db',
      redisUrl: 'redis://h:6379',
      nested: { authorization: 'Bearer xyz', secret: 's' },
    }) as Record<string, unknown>;

    expect(out.id).toBe('u1');
    expect(out.email).toBe('a@b.com');
    for (const k of ['password', 'passwordHash', 'accessToken', 'refreshToken', 'totpSecret', 'privateKey', 'apiKey', 'webhookSecret', 'databaseUrl', 'redisUrl']) {
      expect(out[k]).toBe('[REDACTED]');
    }
    const nested = out.nested as Record<string, unknown>;
    expect(nested.authorization).toBe('[REDACTED]');
    expect(nested.secret).toBe('[REDACTED]');

    // Nothing secret survives anywhere in the serialized form.
    const serialized = JSON.stringify(out);
    for (const leak of ['hunter2', 'eyJabc', 'eyJdef', 'JBSWY3DPEHPK3PXP', 'sk_live_123', 'whsec_123', 'postgresql://']) {
      expect(serialized).not.toContain(leak);
    }
  });
});
