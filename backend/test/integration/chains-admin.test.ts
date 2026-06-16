import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { adminApiRouter } from '../../src/routes/admin';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken, signAdminAccessToken } from '../../src/lib/jwt';

/**
 * Admin multi-chain endpoints (Phase 5.1) — list chains, per-chain health,
 * cursor, deposits, withdrawals, with RBAC (deposit.view vs withdrawal.view).
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
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

d('Admin chains endpoints (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  let userToken = '';
  let fullToken = ''; // deposit.view + withdrawal.view
  let depositOnlyToken = ''; // deposit.view only
  const adminIds: string[] = [];
  const roleIds: string[] = [];
  let userId = '';

  async function mkAdmin(perms: string[]): Promise<string> {
    const role = await prisma.role.create({ data: { name: `CHN_${randomUUID().slice(0, 8)}`, scope: 'ADMIN', description: 'chains test' } });
    roleIds.push(role.id);
    for (const code of perms) {
      const perm = await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
    const admin = await prisma.admin.create({ data: { email: `chn_${randomUUID().slice(0, 8)}@example.com`, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    adminIds.push(admin.id);
    await prisma.adminRole.create({ data: { adminId: admin.id, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId: admin.id, refreshHash: `ar_${randomUUID()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    return signAdminAccessToken({ sub: admin.id, sid: asid });
  }

  beforeAll(async () => {
    // Ensure the three networks exist (seed also creates these).
    await prisma.asset.upsert({ where: { symbol: 'USDT' }, update: {}, create: { symbol: 'USDT', name: 'Tether USD', kind: 'CRYPTO', decimals: 6 } });
    await prisma.asset.upsert({ where: { symbol: 'ETH' }, update: {}, create: { symbol: 'ETH', name: 'Ethereum', kind: 'CRYPTO', decimals: 18 } });
    await prisma.chain.upsert({ where: { id: 'ETHEREUM' }, update: {}, create: { id: 'ETHEREUM', name: 'Ethereum', family: 'EVM', nativeAsset: 'ETH' } });
    await prisma.assetChain.upsert({
      where: { asset_chain: { asset: 'USDT', chain: 'ETHEREUM' } },
      update: { isActive: true },
      create: { asset: 'USDT', chain: 'ETHEREUM', contractAddr: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, minConfirmations: 12 },
    });

    const u = await prisma.user.create({ data: { email: `chnU_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), status: 'ACTIVE' } });
    userId = u.id;
    const usid = randomUUID();
    await prisma.authSession.create({ data: { id: usid, userId: u.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    userToken = signAccessToken({ sub: u.id, sid: usid, kycTier: 0 });

    fullToken = await mkAdmin(['deposit.view', 'withdrawal.view']);
    depositOnlyToken = await mkAdmin(['deposit.view']);
  });

  afterAll(async () => {
    try {
      await prisma.authSession.deleteMany({ where: { userId } });
      for (const aid of adminIds) {
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

  const get = (token: string, path: string) =>
    request(app).get(`/admin/chains${path}`).set('Authorization', `Bearer ${token}`);

  it('rejects a non-admin user token', async () => {
    expect((await get(userToken, '')).status).toBe(401);
  });

  it('lists chains with their USDT networks', async () => {
    const res = await get(depositOnlyToken, '');
    expect(res.status).toBe(200);
    const eth = res.body.data.items.find((c: { chain: string }) => c.chain === 'ETHEREUM');
    expect(eth).toBeTruthy();
    expect(eth.provider.mode).toBe('mock');
    expect(eth.networks.some((n: { asset: string }) => n.asset.toUpperCase() === 'USDT')).toBe(true);
  });

  it('returns per-chain health and cursor', async () => {
    const health = await get(depositOnlyToken, '/ETHEREUM/health');
    expect(health.status).toBe(200);
    expect(health.body.data.chain).toBe('ETHEREUM');
    expect(health.body.data.provider.mode).toBe('mock');

    const cursor = await get(depositOnlyToken, '/ETHEREUM/cursor');
    expect(cursor.status).toBe(200);
    expect(cursor.body.data.chain).toBe('ETHEREUM');
  });

  it('lists per-chain deposits (deposit.view)', async () => {
    const res = await get(depositOnlyToken, '/ETHEREUM/deposits?limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('gates withdrawals behind withdrawal.view', async () => {
    const denied = await get(depositOnlyToken, '/ETHEREUM/withdrawals');
    expect(denied.status).toBe(403);

    const ok = await get(fullToken, '/ETHEREUM/withdrawals?limit=10');
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.data.items)).toBe(true);
  });
});
