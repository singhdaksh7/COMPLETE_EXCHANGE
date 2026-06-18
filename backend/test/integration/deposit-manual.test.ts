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

async function servicesUp(): Promise<boolean> {
  try {
    await connectRedis();
    const redisOk = await isRedisHealthy();
    const dbOk = await prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
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

d('Manual INR deposit (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const userId_email = `manual_${suffix}@example.com`;
  const userSessionId = randomUUID();
  const approverEmail = `mdapprove_${suffix}@example.com`;
  const viewerEmail = `mdview_${suffix}@example.com`;
  const approverSessionId = randomUUID();
  const viewerSessionId = randomUUID();
  const utr = `UTR${suffix}AB`;

  let userId = '';
  let userToken = '';
  let approverId = '';
  let viewerId = '';
  let approverToken = '';
  let viewerToken = '';
  let approverRoleId = '';
  let viewerRoleId = '';
  let depositId = '';
  let rejectDepositId = '';

  beforeAll(async () => {
    await prisma.asset.upsert({
      where: { symbol: 'INR' },
      update: {},
      create: { symbol: 'INR', name: 'Indian Rupee', kind: 'FIAT', decimals: 2 },
    });

    const user = await prisma.user.create({
      data: {
        email: userId_email,
        passwordHash: await hash('Str0ngPassword'),
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
        kycStatus: 'APPROVED',
        kycTier: 1,
      },
    });
    userId = user.id;
    await prisma.authSession.create({
      data: {
        id: userSessionId,
        userId,
        refreshHash: `refresh_${suffix}`,
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    userToken = signAccessToken({ sub: userId, sid: userSessionId, kycTier: 1 });

    // Permissions: approver gets inr.approve, viewer gets only inr.deposit.view.
    const perms = await Promise.all(
      ['inr.approve', 'inr.deposit.view'].map((code) =>
        prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } }),
      ),
    );
    const approvePerm = perms.find((p) => p.code === 'inr.approve')!;
    const viewPerm = perms.find((p) => p.code === 'inr.deposit.view')!;

    const approverRole = await prisma.role.create({
      data: { name: `manual_dep_approver_${suffix}`, scope: 'ADMIN', description: 'manual dep test' },
    });
    approverRoleId = approverRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: approverRole.id, permissionId: approvePerm.id },
        { roleId: approverRole.id, permissionId: viewPerm.id },
      ],
      skipDuplicates: true,
    });

    const viewerRole = await prisma.role.create({
      data: { name: `manual_dep_viewer_${suffix}`, scope: 'ADMIN', description: 'manual dep viewer' },
    });
    viewerRoleId = viewerRole.id;
    await prisma.rolePermission.create({
      data: { roleId: viewerRole.id, permissionId: viewPerm.id },
    });

    const approver = await prisma.admin.create({
      data: { email: approverEmail, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' },
    });
    approverId = approver.id;
    await prisma.adminRole.create({ data: { adminId: approverId, roleId: approverRole.id } });
    await prisma.adminSession.create({
      data: { id: approverSessionId, adminId: approverId, refreshHash: `arefresh_a_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    approverToken = signAdminAccessToken({ sub: approverId, sid: approverSessionId });

    const viewer = await prisma.admin.create({
      data: { email: viewerEmail, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' },
    });
    viewerId = viewer.id;
    await prisma.adminRole.create({ data: { adminId: viewerId, roleId: viewerRole.id } });
    await prisma.adminSession.create({
      data: { id: viewerSessionId, adminId: viewerId, refreshHash: `arefresh_v_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    viewerToken = signAdminAccessToken({ sub: viewerId, sid: viewerSessionId });
  });

  afterAll(async () => {
    try {
      await prisma.inrTransaction.deleteMany({ where: { userId } });
      await prisma.idempotencyKey.deleteMany({ where: { userId } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.adminSession.deleteMany({ where: { adminId: { in: [approverId, viewerId] } } });
      await prisma.adminRole.deleteMany({ where: { adminId: { in: [approverId, viewerId] } } });
      await prisma.admin.deleteMany({ where: { id: { in: [approverId, viewerId] } } });
      for (const rid of [approverRoleId, viewerRoleId]) {
        if (rid) {
          await prisma.rolePermission.deleteMany({ where: { roleId: rid } });
          await prisma.role.deleteMany({ where: { id: rid } });
        }
      }
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('lets an approved user submit a manual deposit (PENDING, provider MANUAL)', async () => {
    const res = await request(app)
      .post('/api/v1/inr/deposits/manual')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `manual-${suffix}-1`)
      .send({ amount: '700.00', utr, method: 'UPI' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.provider).toBe('MANUAL');
    expect(res.body.data.utr).toBe(utr);
    depositId = res.body.data.id;
  });

  it('blocks a duplicate UTR at the DB level', async () => {
    const res = await request(app)
      .post('/api/v1/inr/deposits/manual')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `manual-${suffix}-dup`)
      .send({ amount: '700.00', utr, method: 'UPI' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_UTR');
  });

  it('forbids an admin without inr.approve from approving', async () => {
    const res = await request(app)
      .post(`/admin/inr/deposits/${depositId}/approve`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send();
    expect(res.status).toBe(403);
  });

  it('credits the user INR wallet when an authorized admin approves', async () => {
    const res = await request(app)
      .post(`/admin/inr/deposits/${depositId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUCCESS');
    expect(res.body.data.ledgerTxnId).toBeTruthy();
    expect(res.body.data.reviewedBy).toBe(approverId);

    const wallet = await request(app)
      .get('/api/v1/wallets/INR')
      .set('Authorization', `Bearer ${userToken}`);
    expect(wallet.status).toBe(200);
    expect(wallet.body.data.available).toBe('700');
  });

  it('is idempotent: re-approving does not double-credit', async () => {
    const res = await request(app)
      .post(`/admin/inr/deposits/${depositId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUCCESS');

    const wallet = await request(app)
      .get('/api/v1/wallets/INR')
      .set('Authorization', `Bearer ${userToken}`);
    expect(wallet.body.data.available).toBe('700'); // unchanged
  });

  it('rejects a separate deposit with a reason and does not credit', async () => {
    const submit = await request(app)
      .post('/api/v1/inr/deposits/manual')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `manual-${suffix}-2`)
      .send({ amount: '300.00', utr: `${utr}X`, method: 'IMPS' });
    expect(submit.status).toBe(201);
    rejectDepositId = submit.body.data.id;

    const res = await request(app)
      .post(`/admin/inr/deposits/${rejectDepositId}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ reason: 'No matching bank credit found' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FAILED');
    expect(res.body.data.rejectionReason).toBe('No matching bank credit found');

    // Reviewing admin + reason are persisted (FK trail).
    const row = await prisma.inrTransaction.findUnique({ where: { id: rejectDepositId } });
    expect(row?.reviewedBy).toBe(approverId);
    expect(row?.rejectionReason).toBe('No matching bank credit found');

    const wallet = await request(app)
      .get('/api/v1/wallets/INR')
      .set('Authorization', `Bearer ${userToken}`);
    expect(wallet.body.data.available).toBe('700'); // still only the approved deposit
  });

  it('cannot reject an already-credited deposit', async () => {
    const res = await request(app)
      .post(`/admin/inr/deposits/${depositId}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ reason: 'too late' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_CREDITED');
  });
});
