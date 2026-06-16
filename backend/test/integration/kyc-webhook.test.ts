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
import { signKycWebhook } from '../../src/modules/kyc/providers/kyc.mock';

/**
 * KYC verification webhook (Phase 5.3) — signature-verified, idempotent status
 * transitions, admin visibility, and no PII leakage. The existing submit/approve
 * flow is covered by kyc.test.ts and remains unchanged.
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
  // Mirror production: capture the raw body so HMAC verification sees exact bytes.
  app.use(express.json({ verify: (req, _res, buf) => { (req as { rawBody?: Buffer }).rawBody = buf; } }));
  app.use(requestContext);
  app.use('/api/v1', apiRouter);
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

const PAN = 'ABCDE1234F';

d('KYC provider webhook (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);

  async function newUser(): Promise<{ id: string; token: string; ref: string }> {
    const user = await prisma.user.create({ data: { email: `kw_${randomUUID().slice(0, 8)}@example.com`, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE' } });
    const sid = randomUUID();
    await prisma.authSession.create({ data: { id: sid, userId: user.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    const token = signAccessToken({ sub: user.id, sid, kycTier: 0 });
    const submit = await request(app)
      .post('/api/v1/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: `User ${suffix}`, dob: '1990-01-01', pan: PAN });
    expect(submit.status).toBe(202);
    const profile = await prisma.kycProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.providerStatus).toBe('PENDING');
    expect(profile.providerRef).toBeTruthy();
    return { id: user.id, token, ref: profile.providerRef as string };
  }

  function postWebhook(body: object, sign = true) {
    const raw = JSON.stringify(body);
    const req = request(app).post('/api/v1/kyc/webhook').set('Content-Type', 'application/json');
    if (sign) req.set('x-kyc-signature', signKycWebhook(raw));
    return req.send(raw);
  }

  let adminToken = '';
  let adminId = '';
  let roleId = '';
  const userIds: string[] = [];

  beforeAll(async () => {
    const perms = await Promise.all(['kyc.view', 'kyc.review'].map((code) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } })));
    const role = await prisma.role.create({ data: { name: `KYCW_${suffix}`, scope: 'ADMIN', description: 'kyc webhook test' } });
    roleId = role.id;
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
    const admin = await prisma.admin.create({ data: { email: `kwadmin_${suffix}@example.com`, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    adminId = admin.id;
    await prisma.adminRole.create({ data: { adminId, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId, refreshHash: `ar_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    adminToken = signAdminAccessToken({ sub: adminId, sid: asid });
  });

  afterAll(async () => {
    try {
      await prisma.kycDocument.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.kycProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.adminRole.deleteMany({ where: { adminId } });
      await prisma.adminSession.deleteMany({ where: { adminId } });
      if (roleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        await prisma.role.deleteMany({ where: { id: roleId } });
      }
    } catch {
      /* best-effort */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('rejects a webhook with a missing/invalid signature (401)', async () => {
    const u = await newUser(); userIds.push(u.id);
    const bad = await postWebhook({ providerRef: u.ref, status: 'VERIFIED' }, false);
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_SIGNATURE');
    // No transition occurred.
    const p = await prisma.kycProfile.findUniqueOrThrow({ where: { userId: u.id } });
    expect(p.providerStatus).toBe('PENDING');
  });

  it('VERIFIED webhook marks providerStatus VERIFIED but keeps profile in review', async () => {
    const u = await newUser(); userIds.push(u.id);
    const res = await postWebhook({ providerRef: u.ref, status: 'VERIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('processed');

    const p = await prisma.kycProfile.findUniqueOrThrow({ where: { userId: u.id } });
    expect(p.providerStatus).toBe('VERIFIED');
    expect(p.status).toBe('PENDING'); // admin still assigns the tier
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.kycStatus).toBe('PENDING');
  });

  it('is idempotent — a duplicate VERIFIED webhook makes no second transition/audit', async () => {
    const u = await newUser(); userIds.push(u.id);
    const first = await postWebhook({ providerRef: u.ref, status: 'VERIFIED' });
    expect(first.body.data.status).toBe('processed');
    const second = await postWebhook({ providerRef: u.ref, status: 'VERIFIED' });
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('duplicate');

    const audits = await prisma.auditLog.count({ where: { action: 'kyc.provider.verified', entityId: u.id } });
    expect(audits).toBe(1); // exactly one, not two
  });

  it('REJECTED webhook moves the profile + user to REJECTED', async () => {
    const u = await newUser(); userIds.push(u.id);
    const res = await postWebhook({ providerRef: u.ref, status: 'declined' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('processed');

    const p = await prisma.kycProfile.findUniqueOrThrow({ where: { userId: u.id } });
    expect(p.providerStatus).toBe('REJECTED');
    expect(p.status).toBe('REJECTED');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.kycStatus).toBe('REJECTED');
  });

  it('ignores a webhook for an unknown reference (200, no error)', async () => {
    const res = await postWebhook({ providerRef: `kyc_unknown_${suffix}`, status: 'VERIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ignored');
  });

  it('manual admin approval still works after provider VERIFIED', async () => {
    const u = await newUser(); userIds.push(u.id);
    await postWebhook({ providerRef: u.ref, status: 'VERIFIED' });

    const decide = await request(app)
      .post(`/admin/kyc/${u.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVE', tier: 2 });
    expect(decide.status).toBe(200);
    expect(decide.body.data.status).toBe('APPROVED');
    expect(decide.body.data.tier).toBe(2);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.kycStatus).toBe('APPROVED');
    expect(user.kycTier).toBe(2);
  });

  it('exposes provider visibility to admins and no PII to the user', async () => {
    const u = await newUser(); userIds.push(u.id);
    await postWebhook({ providerRef: u.ref, status: 'VERIFIED' });

    // Admin queue shows provider name/ref/status/updatedAt.
    const queue = await request(app).get('/admin/kyc').set('Authorization', `Bearer ${adminToken}`);
    expect(queue.status).toBe(200);
    const item = queue.body.data.items.find((i: { userId: string }) => i.userId === u.id);
    expect(item.provider).toBe('mock');
    expect(item.providerStatus).toBe('VERIFIED');
    expect(item.providerRef).toBeTruthy();

    // User status shows the normalized providerStatus — but never PII/raw payload.
    const status = await request(app).get('/api/v1/kyc').set('Authorization', `Bearer ${u.token}`);
    expect(status.status).toBe(200);
    expect(status.body.data.providerStatus).toBe('VERIFIED');
    const raw = JSON.stringify(status.body);
    expect(raw).not.toMatch(new RegExp(PAN));
    expect(raw).not.toMatch(/pan_enc|panEnc|aadhaar|providerRef/i);
  });
});
