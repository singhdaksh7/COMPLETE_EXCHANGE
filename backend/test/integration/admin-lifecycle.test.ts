import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { adminApiRouter } from '../../src/routes/admin';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis } from '../../src/lib/redis';
import { ensureAdminRbacBaseline } from '../../src/modules/admin-rbac/admin-rbac.baseline';
import { adminRbacService } from '../../src/modules/admin-rbac/admin-rbac.service';

/**
 * Stage 7A — admin lifecycle + activity profile (integration).
 *
 * Verifies soft deactivation is SUPER_ADMIN-only, blocks login, preserves logs,
 * refuses self-deactivation + last-super-admin removal, gates the read-only
 * activity/profile views by permission, and never leaks secrets.
 */

async function servicesUp(): Promise<boolean> {
  try {
    await connectRedis();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const up = await servicesUp();
const d = up ? describe : describe.skip;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

async function login(
  app: Express,
  email: string,
  password: string,
): Promise<request.Response> {
  return request(app)
    .post('/admin/auth/login')
    .send({ email, password, totp: '000000' });
}

d('admin lifecycle module (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8).toLowerCase();
  const password = 'AdminPassw0rd!';

  const superEmail = `life_super_${suffix}@example.com`;
  const soleSuperEmail = `life_sole_${suffix}@example.com`;
  const ghostSuperEmail = `life_ghost_${suffix}@example.com`;
  const normalEmail = `life_normal_${suffix}@example.com`;
  const targetEmail = `life_target_${suffix}@example.com`;

  let superId = '';
  let soleSuperId = '';
  let ghostSuperId = '';
  let normalId = '';
  let targetId = '';
  let superToken = '';
  let normalToken = '';
  let lockedPreexistingSuperIds: string[] = [];

  beforeAll(async () => {
    await ensureAdminRbacBaseline(prisma);
    const passwordHash = await hash(password);

    const superRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
    });
    const supportRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPPORT' },
    });

    // Neutralise any pre-existing active super admins so our created supers are
    // the only ACTIVE ones (deterministic last-super-admin accounting).
    const preexisting = await prisma.adminRole.findMany({
      where: { roleId: superRole.id, admin: { status: 'ACTIVE' } },
      select: { adminId: true },
    });
    lockedPreexistingSuperIds = preexisting.map((r) => r.adminId);
    if (lockedPreexistingSuperIds.length > 0) {
      await prisma.admin.updateMany({
        where: { id: { in: lockedPreexistingSuperIds } },
        data: { status: 'LOCKED' },
      });
    }

    const mk = (email: string, status = 'ACTIVE') =>
      prisma.admin.create({
        data: {
          email,
          passwordHash,
          totpSecretEnc: Buffer.alloc(0),
          totpEnabled: false,
          status,
        },
      });

    const superA = await mk(superEmail);
    const soleSuper = await mk(soleSuperEmail);
    const ghostSuper = await mk(ghostSuperEmail, 'SUSPENDED');
    const normal = await mk(normalEmail);
    const target = await mk(targetEmail);
    superId = superA.id;
    soleSuperId = soleSuper.id;
    ghostSuperId = ghostSuper.id;
    normalId = normal.id;
    targetId = target.id;

    await prisma.adminRole.createMany({
      data: [
        { adminId: superA.id, roleId: superRole.id },
        { adminId: soleSuper.id, roleId: superRole.id },
        { adminId: ghostSuper.id, roleId: superRole.id },
        { adminId: normal.id, roleId: supportRole.id },
        { adminId: target.id, roleId: supportRole.id },
      ],
      skipDuplicates: true,
    });

    superToken = (await login(app, superEmail, password)).body.data.tokens
      .accessToken;
    normalToken = (await login(app, normalEmail, password)).body.data.tokens
      .accessToken;
  });

  afterAll(async () => {
    try {
      if (lockedPreexistingSuperIds.length > 0) {
        await prisma.admin.updateMany({
          where: { id: { in: lockedPreexistingSuperIds } },
          data: { status: 'ACTIVE' },
        });
      }
      // Retain created admins + admin_logs (append-only; unique emails per run).
    } catch {
      /* best-effort */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('super admin can deactivate another admin and it is audit-logged', async () => {
    const res = await request(app)
      .post(`/admin/admins/${targetId}/deactivate`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'Offboarding for Stage 7A test' });
    expect(res.status).toBe(200);
    expect(res.body.data.admin.status).toBe('DEACTIVATED');

    const logged = await prisma.adminLog.count({
      where: { adminId: superId, action: 'admin.deactivate', targetId },
    });
    expect(logged).toBeGreaterThanOrEqual(1);

    // Row is retained (soft delete) with the deactivation anchors populated.
    const row = await prisma.admin.findUniqueOrThrow({ where: { id: targetId } });
    expect(row.status).toBe('DEACTIVATED');
    expect(row.deactivatedBy).toBe(superId);
    expect(row.deactivationReason).toContain('Offboarding');
    expect(row.deactivatedAt).not.toBeNull();
  });

  it('refuses self-deactivation', async () => {
    const res = await request(app)
      .post(`/admin/admins/${superId}/deactivate`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'trying to remove myself' });
    expect(res.status).toBe(400);
  });

  it('forbids a non-super admin from deactivating an admin', async () => {
    const res = await request(app)
      .post(`/admin/admins/${superId}/deactivate`)
      .set('Authorization', `Bearer ${normalToken}`)
      .send({ reason: 'should not be allowed' });
    expect(res.status).toBe(403);
  });

  it('blocks login for a deactivated admin', async () => {
    const res = await login(app, targetEmail, password);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_NOT_ACTIVE');
  });

  it('requires permission for the activity timeline', async () => {
    const res = await request(app)
      .get(`/admin/admins/${superId}/activity`)
      .set('Authorization', `Bearer ${normalToken}`);
    expect(res.status).toBe(403);
  });

  it('exposes the activity timeline to a super admin without leaking secrets', async () => {
    const res = await request(app)
      .get(`/admin/admins/${superId}/activity?limit=50`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    const blob = JSON.stringify(res.body).toLowerCase();
    expect(blob).not.toContain('totpsecret');
    expect(blob).not.toContain('passwordhash');
    expect(blob).not.toContain('recovery');
  });

  it('keeps profile + logs queryable after deactivation', async () => {
    const profile = await request(app)
      .get(`/admin/admins/${targetId}/profile`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.profile.status).toBe('DEACTIVATED');
    expect(profile.body.data.profile.activitySummary).toBeTruthy();

    const activity = await request(app)
      .get(`/admin/admins/${targetId}/activity`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(activity.status).toBe(200);
  });

  it('reactivates a deactivated admin and login works again', async () => {
    const react = await request(app)
      .post(`/admin/admins/${targetId}/reactivate`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'Rejoined for Stage 7A test' });
    expect(react.status).toBe(200);
    expect(react.body.data.admin.status).toBe('ACTIVE');

    const relogin = await login(app, targetEmail, password);
    expect(relogin.status).toBe(200);
    expect(relogin.body.data.tokens.accessToken).toBeTruthy();
  });

  it('refuses to deactivate the last active super admin', async () => {
    // Isolate: suspend the HTTP actor so `soleSuper` is the ONLY active super.
    await prisma.admin.update({
      where: { id: superId },
      data: { status: 'SUSPENDED' },
    });
    try {
      const activeSupers = await prisma.adminRole.count({
        where: { role: { name: 'SUPER_ADMIN' }, admin: { status: 'ACTIVE' } },
      });
      expect(activeSupers).toBe(1);
      // ghostSuper (suspended, but still holds the SUPER_ADMIN role) acts here so
      // the actor-role check passes while the target is the sole active super.
      await expect(
        adminRbacService.deactivateAdmin(
          soleSuperId,
          { reason: 'should be refused' },
          { adminId: ghostSuperId },
        ),
      ).rejects.toMatchObject({ errorCode: 'LAST_SUPER_ADMIN' });
    } finally {
      await prisma.admin.update({
        where: { id: superId },
        data: { status: 'ACTIVE' },
      });
    }
  });
});
