import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { apiRouter } from '../../src/routes';
import { adminApiRouter } from '../../src/routes/admin';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken, signAdminAccessToken } from '../../src/lib/jwt';
import { Prisma } from '@prisma/client';
import { notificationService } from '../../src/modules/notification/notification.service';
import { NotificationType } from '../../src/modules/notification/notification.types';
import { withdrawalService } from '../../src/modules/withdrawal/withdrawal.service';

/**
 * Internal notifications (Phase 5.5): user + admin list/read/read-all/unread,
 * strict owner isolation, event-driven creation (KYC approval, withdrawal
 * approve/reject), and no PII in metadata.
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
  app.use('/api/v1', apiRouter);
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

d('Internal notifications (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  let userAId = '';
  let userBId = '';
  let userAToken = '';
  let userBToken = '';
  let adminId = '';
  let adminToken = '';

  async function mkUser(): Promise<{ id: string; token: string }> {
    const u = await prisma.user.create({ data: { email: `ntf_${randomUUID().slice(0, 8)}@example.com`, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE', kycStatus: 'PENDING' } });
    const sid = randomUUID();
    await prisma.authSession.create({ data: { id: sid, userId: u.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    return { id: u.id, token: signAccessToken({ sub: u.id, sid, kycTier: 0 }) };
  }

  beforeAll(async () => {
    const a = await mkUser();
    const b = await mkUser();
    userAId = a.id; userAToken = a.token;
    userBId = b.id; userBToken = b.token;

    const perm = await prisma.permission.upsert({ where: { code: 'kyc.review' }, update: {}, create: { code: 'kyc.review', description: 'kyc.review' } });
    const role = await prisma.role.create({ data: { name: `NTF_${suffix}`, scope: 'ADMIN', description: 'notif test' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    const admin = await prisma.admin.create({ data: { email: `ntfadmin_${suffix}@example.com`, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    adminId = admin.id;
    await prisma.adminRole.create({ data: { adminId, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId, refreshHash: `ar_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    adminToken = signAdminAccessToken({ sub: adminId, sid: asid });
  });

  afterAll(async () => {
    try {
      await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: [userAId, userBId] } }, { adminId }] } });
      await prisma.authSession.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
      await prisma.adminRole.deleteMany({ where: { adminId } });
      await prisma.adminSession.deleteMany({ where: { adminId } });
      await prisma.kycProfile.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    } catch {
      /* best-effort */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('creates a user notification and lists it', async () => {
    await notificationService.notifyUser({ userId: userAId, type: NotificationType.ORDER_FILLED, title: 'Order filled', message: 'Your order filled.', metadata: { orderId: 'o1' } });
    const res = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    const n = res.body.data.items[0];
    expect(n).toMatchObject({ type: NotificationType.ORDER_FILLED, status: 'UNREAD', severity: 'INFO' });
  });

  it('returns the unread count and marks one read', async () => {
    const before = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${userAToken}`);
    expect(before.body.data.unread).toBeGreaterThanOrEqual(1);

    const list = await request(app).get('/api/v1/notifications?status=UNREAD').set('Authorization', `Bearer ${userAToken}`);
    const id = list.body.data.items[0].id;
    const read = await request(app).patch(`/api/v1/notifications/${id}/read`).set('Authorization', `Bearer ${userAToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.status).toBe('READ');
    expect(read.body.data.readAt).toBeTruthy();
  });

  it('marks all read and zeroes the unread count', async () => {
    await notificationService.notifyUser({ userId: userAId, type: NotificationType.CONVERSION_COMPLETED, title: 'x', message: 'y' });
    const all = await request(app).patch('/api/v1/notifications/read-all').set('Authorization', `Bearer ${userAToken}`);
    expect(all.status).toBe(200);
    const count = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${userAToken}`);
    expect(count.body.data.unread).toBe(0);
  });

  it('isolates notifications between users', async () => {
    await notificationService.notifyUser({ userId: userBId, type: NotificationType.ORDER_FILLED, title: 'B only', message: 'b' });
    const aList = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${userAToken}`);
    expect(aList.body.data.items.every((n: { title: string }) => n.title !== 'B only')).toBe(true);
    // A cannot mark B's notification read.
    const bRow = await prisma.notification.findFirstOrThrow({ where: { userId: userBId } });
    const cross = await request(app).patch(`/api/v1/notifications/${bRow.id}/read`).set('Authorization', `Bearer ${userAToken}`);
    expect(cross.status).toBe(404);
  });

  it('keeps admin and user notifications separate (no cross-visibility)', async () => {
    await notificationService.notifyAdmins({ type: NotificationType.ADMIN_KYC_PENDING, title: 'Admin only', message: 'admin', metadata: { x: 1 } });
    // User does not see admin notifications.
    const uList = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${userAToken}`);
    expect(uList.body.data.items.every((n: { title: string }) => n.title !== 'Admin only')).toBe(true);
    // Admin sees admin notifications, not user ones.
    const aList = await request(app).get('/admin/notifications').set('Authorization', `Bearer ${adminToken}`);
    expect(aList.status).toBe(200);
    expect(aList.body.data.items.some((n: { title: string }) => n.title === 'Admin only')).toBe(true);
    expect(aList.body.data.items.every((n: { type: string }) => n.type.startsWith('admin.'))).toBe(true);
  });

  it('a non-admin user token is rejected on the admin surface', async () => {
    const res = await request(app).get('/admin/notifications').set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(401);
  });

  it('creates a notification on KYC approval (event-driven, no PII)', async () => {
    // Seed a pending KYC profile for user B, then approve via admin.
    await prisma.kycProfile.upsert({
      where: { userId: userBId },
      update: { status: 'PENDING' },
      create: { userId: userBId, status: 'PENDING', fullName: 'Secret Name', provider: 'mock', providerRef: `kyc_${suffix}` },
    });
    const decide = await request(app).post(`/admin/kyc/${userBId}/decision`).set('Authorization', `Bearer ${adminToken}`).send({ decision: 'APPROVE', tier: 1 });
    expect(decide.status).toBe(200);

    const notif = await prisma.notification.findFirst({ where: { userId: userBId, type: NotificationType.KYC_APPROVED } });
    expect(notif).toBeTruthy();
    // Metadata must not carry PII (no full name, PAN, Aadhaar).
    expect(JSON.stringify(notif?.metadata)).not.toMatch(/Secret Name|pan|aadhaar/i);
    expect(JSON.stringify({ title: notif?.title, message: notif?.message })).not.toMatch(/Secret Name/);
  });

  it('admin notification metadata carries no PII', async () => {
    const adminNotifs = await prisma.notification.findMany({ where: { adminId } });
    const raw = JSON.stringify(adminNotifs.map((n) => ({ t: n.title, m: n.message, meta: n.metadata })));
    expect(raw).not.toMatch(/Secret Name|pan_enc|aadhaar|passwordHash/i);
  });

  it('notifies the user on withdrawal approval and rejection', async () => {
    const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);
    await prisma.asset.upsert({ where: { symbol: 'USDT' }, update: {}, create: { symbol: 'USDT', name: 'Tether USD', kind: 'CRYPTO', decimals: 6 } });
    await prisma.asset.upsert({ where: { symbol: 'TRX' }, update: {}, create: { symbol: 'TRX', name: 'TRON', kind: 'CRYPTO', decimals: 6 } });
    await prisma.chain.upsert({ where: { id: 'TRON' }, update: {}, create: { id: 'TRON', name: 'TRON', family: 'TRON', nativeAsset: 'TRX' } });

    const base = { userId: userAId, chain: 'TRON', asset: 'USDT', amount: D('10'), fee: D('1'), netAmount: D('9'), status: 'PENDING_APPROVAL' as const };
    const toApprove = await prisma.cryptoWithdrawal.create({ data: { ...base, toAddress: `Tappr_${suffix}` } });
    const toReject = await prisma.cryptoWithdrawal.create({ data: { ...base, toAddress: `Trej_${suffix}` } });

    await withdrawalService.approve(toApprove.id, { actorId: adminId });
    await withdrawalService.reject(toReject.id, 'risk', { actorId: adminId });

    const approved = await prisma.notification.findFirst({ where: { userId: userAId, type: NotificationType.WITHDRAWAL_APPROVED } });
    const rejected = await prisma.notification.findFirst({ where: { userId: userAId, type: NotificationType.WITHDRAWAL_REJECTED } });
    expect(approved).toBeTruthy();
    expect(rejected).toBeTruthy();
    expect(rejected?.severity).toBe('WARNING');

    await prisma.cryptoWithdrawal.deleteMany({ where: { id: { in: [toApprove.id, toReject.id] } } });
  });
});
