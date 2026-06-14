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
import { signAccessToken } from '../../src/lib/jwt';

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

d('admin RBAC module (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const adminEmail = `admin_${suffix.toLowerCase()}@example.com`;
  const otherEmail = `other_${suffix.toLowerCase()}@example.com`;
  const password = 'AdminPassw0rd!';
  const roleName = `TEST_${suffix}`;
  const permissionCode = `test.perm.${suffix.toLowerCase()}`;

  let adminId = '';
  let otherAdminId = '';
  let superRoleId = '';
  let roleId = '';
  let permissionId = '';
  let accessToken = '';
  let restoredSuperAdminIds: string[] = [];

  beforeAll(async () => {
    const passwordHash = await hash(password);
    const roleManage = await prisma.permission.upsert({
      where: { code: 'role.manage' },
      update: {},
      create: { code: 'role.manage', description: 'Manage roles' },
    });
    const adminManage = await prisma.permission.upsert({
      where: { code: 'admin.manage' },
      update: {},
      create: { code: 'admin.manage', description: 'Manage admins' },
    });
    const superRole = await prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: {
        name: 'SUPER_ADMIN',
        scope: 'ADMIN',
        description: 'Full administrative access',
        isSystem: true,
      },
    });
    superRoleId = superRole.id;
    const existingActiveSuperAdmins = await prisma.adminRole.findMany({
      where: {
        roleId: superRole.id,
        admin: { status: 'ACTIVE' },
      },
      select: { adminId: true },
    });
    restoredSuperAdminIds = existingActiveSuperAdmins.map((row) => row.adminId);
    if (restoredSuperAdminIds.length > 0) {
      await prisma.admin.updateMany({
        where: { id: { in: restoredSuperAdminIds } },
        data: { status: 'LOCKED' },
      });
    }
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superRole.id,
          permissionId: roleManage.id,
        },
      },
      update: {},
      create: { roleId: superRole.id, permissionId: roleManage.id },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superRole.id,
          permissionId: adminManage.id,
        },
      },
      update: {},
      create: { roleId: superRole.id, permissionId: adminManage.id },
    });
    const admin = await prisma.admin.create({
      data: {
        email: adminEmail,
        passwordHash,
        totpSecretEnc: Buffer.alloc(0),
        totpEnabled: false,
      },
    });
    const other = await prisma.admin.create({
      data: {
        email: otherEmail,
        passwordHash,
        totpSecretEnc: Buffer.alloc(0),
        totpEnabled: false,
      },
    });
    adminId = admin.id;
    otherAdminId = other.id;
    await prisma.adminRole.create({
      data: { adminId: admin.id, roleId: superRole.id },
    });
  });

  afterAll(async () => {
    try {
      if (permissionId) {
        await prisma.rolePermission.deleteMany({ where: { permissionId } });
      }
      if (roleId) {
        await prisma.adminRole.deleteMany({ where: { roleId } });
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        await prisma.role.deleteMany({ where: { id: roleId } });
      }
      if (permissionId) {
        await prisma.permission.deleteMany({ where: { id: permissionId } });
      }
      await prisma.adminRole.deleteMany({
        where: { adminId: { in: [adminId, otherAdminId].filter(Boolean) } },
      });
      await prisma.adminSession.deleteMany({
        where: { adminId: { in: [adminId, otherAdminId].filter(Boolean) } },
      });
      if (restoredSuperAdminIds.length > 0) {
        await prisma.admin.updateMany({
          where: { id: { in: restoredSuperAdminIds } },
          data: { status: 'ACTIVE' },
        });
      }
      // Do not delete admins or admin_logs here. admin_logs is append-only and
      // references admins; test emails are unique per run so retained rows do
      // not collide with future integration runs.
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('logs in and reads the admin profile', async () => {
    const login = await request(app)
      .post('/admin/auth/login')
      .send({ email: adminEmail, password, totp: '000000' });

    expect(login.status).toBe(200);
    accessToken = login.body.data.tokens.accessToken;
    expect(accessToken).toBeTruthy();

    const me = await request(app)
      .get('/admin/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.roles).toContain('SUPER_ADMIN');
  });

  it('rejects public user JWTs on admin routes', async () => {
    const userToken = signAccessToken({ sub: 'user-1', sid: 'sess-1', kycTier: 0 });
    const res = await request(app)
      .get('/admin/auth/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(401);
  });

  it('manages roles, permissions, and admin assignments with audit logs', async () => {
    const role = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: roleName, description: 'Integration test role' });
    expect(role.status).toBe(201);
    roleId = role.body.data.role.id;

    const permission = await request(app)
      .post('/admin/permissions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: permissionCode, description: 'Integration test permission' });
    expect(permission.status).toBe(201);
    permissionId = permission.body.data.permission.id;

    const grant = await request(app)
      .post(`/admin/roles/${roleId}/permissions/${permissionId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(grant.status).toBe(200);

    const assign = await request(app)
      .post(`/admin/admins/${otherAdminId}/roles/${roleId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(assign.status).toBe(200);

    const removeLastSuper = await request(app)
      .delete(`/admin/admins/${adminId}/roles/${superRoleId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(removeLastSuper.status).toBe(403);
    expect(removeLastSuper.body.error.code).toBe('LAST_SUPER_ADMIN');

    const count = await prisma.adminLog.count({
      where: { adminId, action: { startsWith: 'admin.' } },
    });
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('allows removing SUPER_ADMIN when another active SUPER_ADMIN exists', async () => {
    const grantOtherSuper = await request(app)
      .post(`/admin/admins/${otherAdminId}/roles/${superRoleId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(grantOtherSuper.status).toBe(200);

    const remove = await request(app)
      .delete(`/admin/admins/${adminId}/roles/${superRoleId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(remove.status).toBe(200);
    expect(remove.body.data.removed).toBe(true);
  });
});
