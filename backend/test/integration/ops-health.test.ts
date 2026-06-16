import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { healthRouter } from '../../src/modules/health/health.routes';
import { adminApiRouter } from '../../src/routes/admin';
import { apiRouter } from '../../src/routes';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken, signAdminAccessToken } from '../../src/lib/jwt';

/**
 * Production Operations (Module 4) — health probes + admin ops summary.
 *
 * Verifies the dependency probes return machine-readable JSON with uptime +
 * timestamp and no secrets, the worker/scanner subsystem checks report a
 * status, and /admin/v1/ops/summary aggregates health + backlogs behind RBAC.
 */

async function servicesUp(): Promise<boolean> {
  try {
    await connectRedis();
    const redisOk = await isRedisHealthy();
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return redisOk && dbOk;
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
  app.use('/', healthRouter);
  app.use('/api/v1', apiRouter);
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

const SECRET_RE = /password|secret|DATABASE_URL|REDIS_URL|JWT_|kms_key|private/i;

d('Production ops — health + ops summary (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  let userId = '';
  let userToken = '';
  let opsAdminToken = '';
  let plainAdminToken = '';
  let opsAdminId = '';
  let plainAdminId = '';
  const roleIds: string[] = [];

  async function mkAdmin(perms: string[]): Promise<{ id: string; token: string }> {
    const role = await prisma.role.create({ data: { name: `OPS_${randomUUID().slice(0, 8)}`, scope: 'ADMIN', description: 'ops test' } });
    roleIds.push(role.id);
    for (const code of perms) {
      const perm = await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
    const admin = await prisma.admin.create({ data: { email: `ops_${randomUUID().slice(0, 8)}@example.com`, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    await prisma.adminRole.create({ data: { adminId: admin.id, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId: admin.id, refreshHash: `ar_${randomUUID()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    return { id: admin.id, token: signAdminAccessToken({ sub: admin.id, sid: asid }) };
  }

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `opsU_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE' } });
    userId = u.id;
    const usid = randomUUID();
    await prisma.authSession.create({ data: { id: usid, userId: u.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    userToken = signAccessToken({ sub: u.id, sid: usid, kycTier: 0 });

    const opsAdmin = await mkAdmin(['ops.view']);
    const plainAdmin = await mkAdmin(['kyc.view']); // an admin without ops.view
    opsAdminId = opsAdmin.id; opsAdminToken = opsAdmin.token;
    plainAdminId = plainAdmin.id; plainAdminToken = plainAdmin.token;
  });

  afterAll(async () => {
    try {
      await prisma.authSession.deleteMany({ where: { userId } });
      for (const aid of [opsAdminId, plainAdminId]) {
        await prisma.adminRole.deleteMany({ where: { adminId: aid } });
        await prisma.adminSession.deleteMany({ where: { adminId: aid } });
      }
      for (const rid of roleIds) {
        await prisma.rolePermission.deleteMany({ where: { roleId: rid } });
        await prisma.role.deleteMany({ where: { id: rid } });
      }
    } catch {
      /* best-effort */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('GET /health returns liveness with uptime + timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(typeof res.body.data.timestamp).toBe('string');
  });

  it('GET /health/db verifies a Prisma query (no secrets)', async () => {
    const res = await request(app).get('/health/db');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('up');
    expect(typeof res.body.data.latencyMs).toBe('number');
    expect(JSON.stringify(res.body)).not.toMatch(SECRET_RE);
  });

  it('GET /health/redis verifies a ping (no secrets)', async () => {
    const res = await request(app).get('/health/redis');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('up');
    expect(JSON.stringify(res.body)).not.toMatch(SECRET_RE);
  });

  it('GET /health/workers reports worker subsystem status', async () => {
    const res = await request(app).get('/health/workers');
    expect(res.status).toBe(200);
    expect(['up', 'stale', 'down']).toContain(res.body.data.status);
    expect(typeof res.body.data.withdrawalExecutor.pending).toBe('number');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(typeof res.body.data.timestamp).toBe('string');
  });

  it('GET /health/scanners reports deposit scanners + treasury', async () => {
    const res = await request(app).get('/health/scanners');
    expect(res.status).toBe(200);
    expect(['up', 'stale', 'down', 'idle']).toContain(res.body.data.status);
    const chains = res.body.data.scanners.map((s: { chain: string }) => s.chain);
    expect(chains).toContain('TRON');
    expect(res.body.data.treasury.mode).toBe('synchronous');
    expect(typeof res.body.data.treasury.pendingTransfers).toBe('number');
    expect(JSON.stringify(res.body)).not.toMatch(SECRET_RE);
  });

  it('rejects a non-admin user token on the ops summary', async () => {
    const res = await request(app).get('/admin/ops/summary').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(401);
  });

  it('forbids an admin without ops.view', async () => {
    const res = await request(app).get('/admin/ops/summary').set('Authorization', `Bearer ${plainAdminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns the ops summary for an ops.view admin', async () => {
    const res = await request(app).get('/admin/ops/summary').set('Authorization', `Bearer ${opsAdminToken}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(typeof d.uptime).toBe('number');
    expect(d.dependencies.database).toBe('up');
    expect(d.dependencies.redis).toBe('up');
    expect(typeof d.backlogs.pendingWithdrawals).toBe('number');
    expect(typeof d.backlogs.pendingTreasuryTransfers).toBe('number');
    expect(typeof d.backlogs.openComplianceAlerts).toBe('number');
    // We created a live session above → at least one active user.
    expect(d.activeUsers).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(res.body)).not.toMatch(SECRET_RE);
  });
});
