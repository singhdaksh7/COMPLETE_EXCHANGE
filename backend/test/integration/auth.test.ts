import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { authRouter } from '../../src/modules/auth/auth.routes';
import { authService } from '../../src/modules/auth/auth.service';
import { prisma } from '../../src/lib/prisma';
import {
  redis,
  connectRedis,
  disconnectRedis,
  isRedisHealthy,
} from '../../src/lib/redis';
import { mailer } from '../../src/lib/mailer';

/**
 * End-to-end auth flow against REAL Postgres + Redis. Skipped automatically when
 * those services are unreachable (so the suite still runs anywhere); CI / local
 * Docker provide them. Exercises: register → verify → login → refresh rotation →
 * reuse/family revocation → forgot/reset → change-password → RBAC in /me.
 */
async function servicesUp(): Promise<boolean> {
  let lastFailure = 'unknown';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await connectRedis();
      const redisOk = await isRedisHealthy();
      const dbOk = await prisma
        .$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false);
      if (redisOk && dbOk) return true;
      lastFailure = `redis=${redisOk ? 'ok' : 'failed'} db=${
        dbOk ? 'ok' : 'failed'
      }`;
    } catch (err) {
      lastFailure = err instanceof Error ? err.name : 'Error';
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  // Sanitized: never print connection URLs or raw driver errors.
  console.warn(`Skipping auth integration tests: ${lastFailure}`);
  return false;
}

const up = await servicesUp();
const d = up ? describe : describe.skip;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/auth', authRouter);
  app.use(errorHandler);
  return app;
}

d('auth module (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const email = `it_${suffix}@example.com`;
  const password = 'Str0ngPassword';
  const newPassword = 'NewStr0ngPass1';
  const finalPassword = 'FinalStr0ngPass2';

  let userId = '';
  let roleId = '';
  let permId = '';
  let refresh1 = '';
  let refresh2 = '';
  let refresh3 = '';
  let accessFinal = '';

  beforeAll(async () => {
    mailer.clearOutbox();
  });

  afterAll(async () => {
    try {
      await prisma.userRole.deleteMany({ where: { userId } });
      if (roleId) await prisma.rolePermission.deleteMany({ where: { roleId } });
      if (roleId) await prisma.role.deleteMany({ where: { id: roleId } });
      if (permId) await prisma.permission.deleteMany({ where: { id: permId } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.loginAttempt.deleteMany({ where: { userId } });
      // Do not delete users or audit_logs. Audit logs are append-only and may
      // reference the user; test emails are unique per run.
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('registers without auto-login and requires verification', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.emailVerificationRequired).toBe(true);
    expect(res.body.data).not.toHaveProperty('tokens');
    userId = res.body.data.user.id;
    expect(userId).toBeTruthy();
  });

  it('refuses login before the email is verified', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('grants a role so /me can prove RBAC resolution', async () => {
    const perm = await prisma.permission.create({
      data: { code: `test.view.${suffix}` },
    });
    const role = await prisma.role.create({
      data: { name: `TEST_${suffix}`, scope: 'USER' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: perm.id },
    });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    permId = perm.id;
    roleId = role.id;
  });

  it('verifies the email with the mailed token', async () => {
    const token = mailer.lastTokenFor(email, 'EMAIL_VERIFICATION');
    expect(token).toBeTruthy();
    const res = await request(app)
      .post('/auth/verify-email')
      .send({ token });
    expect(res.status).toBe(200);
    expect(res.body.data.user.emailVerifiedAt).toBeTruthy();
  });

  it('logs in after verification and returns a token pair', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    refresh1 = res.body.data.tokens.refreshToken;
    const access = res.body.data.tokens.accessToken;

    // /me resolves RBAC (the granted permission appears)
    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${access}`);
    expect(me.status).toBe(200);
    expect(me.body.data.permissions).toContain(`test.view.${suffix}`);
    expect(me.body.data.roles).toContain(`TEST_${suffix}`);

    // active session is listed
    const sessions = await request(app)
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${access}`);
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(sessions.body.data.items.some((s: { current: boolean }) => s.current)).toBe(
      true,
    );
  });

  it('rotates the refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: refresh1 });
    expect(res.status).toBe(200);
    refresh2 = res.body.data.tokens.refreshToken;
    expect(refresh2).not.toBe(refresh1);
  });

  it('allows normal refresh with the rotated token before reuse is detected', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: refresh2 });
    expect(res.status).toBe(200);
    refresh3 = res.body.data.tokens.refreshToken;
    expect(refresh3).not.toBe(refresh2);
    expect(refresh3).not.toBe(refresh1);
  });

  it('detects reuse of the old refresh token and revokes the family', async () => {
    const reuse = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: refresh1 });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('TOKEN_REUSE');

    // the latest rotated token is now dead too — whole family revoked
    const after = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: refresh3 });
    expect(after.status).toBe(401);
  });

  it('forgot + reset password, then old password fails and new works', async () => {
    const forgot = await request(app)
      .post('/auth/forgot-password')
      .send({ email });
    expect(forgot.status).toBe(200);

    const token = mailer.lastTokenFor(email, 'PASSWORD_RESET');
    expect(token).toBeTruthy();

    const reset = await request(app)
      .post('/auth/reset-password')
      .send({ token, password: newPassword });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app)
      .post('/auth/login')
      .send({ email, password });
    expect(oldLogin.status).toBe(401);
    expect(oldLogin.body.error.code).toBe('INVALID_CREDENTIALS');

    const newLogin = await request(app)
      .post('/auth/login')
      .send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);
    accessFinal = newLogin.body.data.tokens.accessToken;
  });

  it('changes the password from an authenticated session', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessFinal}`)
      .send({ currentPassword: newPassword, newPassword: finalPassword });
    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(true);

    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: finalPassword });
    expect(login.status).toBe(200);
  });

  it('writes an audit trail for the flow', async () => {
    const count = await prisma.auditLog.count({
      where: { entityId: userId, action: { startsWith: 'auth.' } },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    // RBAC cache cleanup so other suites don't see stale perms
    await authService.invalidatePermissions(userId);
    await redis.del(`rbac:perms:${userId}`).catch(() => undefined);
  });
});
