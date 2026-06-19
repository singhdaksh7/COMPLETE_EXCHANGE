import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { apiRouter } from '../../src/routes';
import { adminApiRouter } from '../../src/routes/admin';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken, signAdminAccessToken } from '../../src/lib/jwt';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { createMockWithdrawalSigner } from '../../src/modules/withdrawal/providers/withdrawal-signer.mock';
import {
  runBroadcastCycle,
  runConfirmationCycle,
} from '../../src/modules/withdrawal/withdrawal.worker';

async function servicesUp(): Promise<boolean> {
  try {
    await connectRedis();
    const redisOk = await isRedisHealthy();
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const schemaOk = await prisma
      .$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'users'
            AND column_name = 'withdrawals_blocked'
        ) AS "exists"
      `
      .then((rows) => rows[0]?.exists === true)
      .catch(() => false);
    return redisOk && dbOk && schemaOk;
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

async function usdt(userId: string): Promise<{ available: string; locked: string }> {
  const w = await ledgerService.getWallet(userId, 'USDT');
  return { available: w.available, locked: w.locked };
}

const TO = `T${'A'.repeat(33)}`;
const NOT_ALLOWED = `T${'B'.repeat(33)}`;

d('crypto withdrawal (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const email = `wd_${suffix}@example.com`;
  const adminEmail = `wdadmin_${suffix}@example.com`;
  const secondAdminEmail = `wdadmin2_${suffix}@example.com`;
  const viewOnlyEmail = `wdview_${suffix}@example.com`;
  const sessionId = randomUUID();
  const adminSessionId = randomUUID();
  const secondAdminSessionId = randomUUID();
  const viewOnlySessionId = randomUUID();
  const roleName = `WD_TEST_${suffix}`;
  const viewRoleName = `WD_VIEW_TEST_${suffix}`;
  const signer = createMockWithdrawalSigner();

  let userId = '';
  let kycPendingUserId = '';
  let frozenUserId = '';
  let blockedUserId = '';
  let lowBalanceUserId = '';
  let largeUserId = '';
  let adminId = '';
  let secondAdminId = '';
  let viewOnlyAdminId = '';
  let roleId = '';
  let viewRoleId = '';
  let hotWalletId = '';
  let signerId = '';
  let accessToken = '';
  let kycPendingToken = '';
  let frozenToken = '';
  let blockedToken = '';
  let lowBalanceToken = '';
  let largeUserToken = '';
  let adminToken = '';
  let secondAdminToken = '';
  let viewOnlyToken = '';
  let reqConf = 20;

  beforeAll(async () => {
    for (const [symbol, name] of [['USDT', 'Tether USD'], ['TRX', 'TRON']] as Array<[string, string]>) {
      await prisma.asset.upsert({
        where: { symbol },
        update: {},
        create: { symbol, name, kind: 'CRYPTO', decimals: 6 },
      });
    }
    await prisma.chain.upsert({
      where: { id: 'TRON' },
      update: {},
      create: { id: 'TRON', name: 'TRON', family: 'TRON', nativeAsset: 'TRX' },
    });
    await prisma.assetChain.upsert({
      where: { asset_chain: { asset: 'USDT', chain: 'TRON' } },
      update: {},
      create: {
        asset: 'USDT',
        chain: 'TRON',
        contractAddr: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        decimals: 6,
        minConfirmations: 20,
      },
    });
    reqConf = (
      await prisma.assetChain.findUniqueOrThrow({
        where: { asset_chain: { asset: 'USDT', chain: 'TRON' } },
      })
    ).minConfirmations;
    await prisma.systemFlag.upsert({
      where: { key: 'withdrawals_frozen' },
      update: { value: { enabled: false } },
      create: { key: 'withdrawals_frozen', value: { enabled: false } },
    });

    const user = await prisma.user.create({
      data: {
        email,
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
        id: sessionId,
        userId,
        refreshHash: `refresh_${suffix}`,
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    accessToken = signAccessToken({ sub: userId, sid: sessionId, kycTier: 1 });

    async function createUserToken(input: {
      email: string;
      status?: 'ACTIVE' | 'FROZEN';
      kycStatus?: 'PENDING' | 'APPROVED';
      kycTier?: number;
      withdrawalsBlocked?: boolean;
      fund?: string;
    }) {
      const u = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash: await hash('Str0ngPassword'),
          emailVerifiedAt: new Date(),
          status: input.status ?? 'ACTIVE',
          kycStatus: input.kycStatus ?? 'APPROVED',
          kycTier: input.kycTier ?? 1,
          withdrawalsBlocked: input.withdrawalsBlocked ?? false,
        },
      });
      const sid = randomUUID();
      await prisma.authSession.create({
        data: {
          id: sid,
          userId: u.id,
          refreshHash: `refresh_${u.id}`,
          familyId: randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await prisma.withdrawalAddress.create({
        data: { userId: u.id, chain: 'TRON', address: TO, whitelistedAt: new Date(Date.now() - 1000) },
      });
      if (input.fund) {
        await ledgerService.post(
          {
            kind: 'TEST_FUNDING',
            referenceType: 'test_funding',
            referenceId: randomUUID(),
            lines: [
              { kind: 'SWEEP_CLEARING', userId: null, asset: 'USDT', direction: 'DEBIT', amount: input.fund },
              { kind: 'USER_AVAILABLE', userId: u.id, asset: 'USDT', direction: 'CREDIT', amount: input.fund },
            ],
          },
          { userId: u.id },
        );
      }
      return {
        id: u.id,
        token: signAccessToken({ sub: u.id, sid, kycTier: input.kycTier ?? 1 }),
      };
    }

    const kycPending = await createUserToken({
      email: `wd_kyc_${suffix}@example.com`,
      kycStatus: 'PENDING',
      kycTier: 0,
      fund: '20',
    });
    kycPendingUserId = kycPending.id;
    kycPendingToken = kycPending.token;
    const frozen = await createUserToken({
      email: `wd_frozen_${suffix}@example.com`,
      status: 'FROZEN',
      fund: '20',
    });
    frozenUserId = frozen.id;
    frozenToken = frozen.token;
    const blocked = await createUserToken({
      email: `wd_blocked_${suffix}@example.com`,
      withdrawalsBlocked: true,
      fund: '20',
    });
    blockedUserId = blocked.id;
    blockedToken = blocked.token;
    const lowBalance = await createUserToken({
      email: `wd_low_${suffix}@example.com`,
      fund: '5',
    });
    lowBalanceUserId = lowBalance.id;
    lowBalanceToken = lowBalance.token;
    const largeUser = await createUserToken({
      email: `wd_large_${suffix}@example.com`,
      fund: '2000',
    });
    largeUserId = largeUser.id;
    largeUserToken = largeUser.token;

    // Fund the user with 100 USDT through the ledger (never directly). Retried
    // on serialization conflict since other integration suites post concurrently
    // against the shared SWEEP_CLEARING system account.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await ledgerService.post(
          {
            kind: 'TEST_FUNDING',
            referenceType: 'test_funding',
            referenceId: randomUUID(),
            lines: [
              { kind: 'SWEEP_CLEARING', userId: null, asset: 'USDT', direction: 'DEBIT', amount: '100' },
              { kind: 'USER_AVAILABLE', userId, asset: 'USDT', direction: 'CREDIT', amount: '100' },
            ],
          },
          { userId },
        );
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034' &&
          attempt < 5
        ) {
          await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    // Allowlist the destination (cooling-off already elapsed).
    await prisma.withdrawalAddress.create({
      data: { userId, chain: 'TRON', address: TO, whitelistedAt: new Date(Date.now() - 1000) },
    });

    // Hot wallet + signer + nonce for execution.
    const sg = await prisma.chainSigner.create({
      data: { chain: 'TRON', name: `signer_${suffix}`, kmsKeyRef: `kms://tron/${suffix}`, publicKey: '0xpub', status: 'ACTIVE' },
    });
    signerId = sg.id;
    const hw = await prisma.hotWallet.create({
      data: { chain: 'TRON', signerId: sg.id, address: `Thot_${suffix}`, tier: 'HOT', label: 'wd-test' },
    });
    hotWalletId = hw.id;
    await prisma.walletNonce.create({ data: { hotWalletId: hw.id, nextNonce: 0 } });

    // Admin authorized via withdrawal permissions (not SUPER_ADMIN).
    const perms = await Promise.all(
      ['withdrawals.view', 'withdrawals.approve', 'withdrawals.review'].map((code) =>
        prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } }),
      ),
    );
    const role = await prisma.role.create({ data: { name: roleName, scope: 'ADMIN', description: 'wd test' } });
    roleId = role.id;
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    const admin = await prisma.admin.create({
      data: { email: adminEmail, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' },
    });
    adminId = admin.id;
    await prisma.adminRole.create({ data: { adminId, roleId: role.id } });
    await prisma.adminSession.create({
      data: { id: adminSessionId, adminId, refreshHash: `arefresh_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    adminToken = signAdminAccessToken({ sub: adminId, sid: adminSessionId });

    const secondAdmin = await prisma.admin.create({
      data: { email: secondAdminEmail, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' },
    });
    secondAdminId = secondAdmin.id;
    await prisma.adminRole.create({ data: { adminId: secondAdminId, roleId: role.id } });
    await prisma.adminSession.create({
      data: { id: secondAdminSessionId, adminId: secondAdminId, refreshHash: `arefresh2_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    secondAdminToken = signAdminAccessToken({ sub: secondAdminId, sid: secondAdminSessionId });

    const viewPerm = await prisma.permission.upsert({
      where: { code: 'withdrawals.view' },
      update: {},
      create: { code: 'withdrawals.view', description: 'View withdrawals' },
    });
    const viewRole = await prisma.role.create({ data: { name: viewRoleName, scope: 'ADMIN', description: 'wd view test' } });
    viewRoleId = viewRole.id;
    await prisma.rolePermission.create({ data: { roleId: viewRole.id, permissionId: viewPerm.id } });
    const viewOnly = await prisma.admin.create({
      data: { email: viewOnlyEmail, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' },
    });
    viewOnlyAdminId = viewOnly.id;
    await prisma.adminRole.create({ data: { adminId: viewOnlyAdminId, roleId: viewRole.id } });
    await prisma.adminSession.create({
      data: { id: viewOnlySessionId, adminId: viewOnlyAdminId, refreshHash: `vrefresh_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    viewOnlyToken = signAdminAccessToken({ sub: viewOnlyAdminId, sid: viewOnlySessionId });
  });

  afterAll(async () => {
    try {
      const userIds = [userId, kycPendingUserId, frozenUserId, blockedUserId, lowBalanceUserId, largeUserId].filter(Boolean);
      await prisma.cryptoWithdrawal.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.withdrawalAddress.deleteMany({ where: { userId: { in: userIds } } });
      if (hotWalletId) await prisma.walletNonce.deleteMany({ where: { hotWalletId } });
      if (hotWalletId) await prisma.hotWallet.deleteMany({ where: { id: hotWalletId } });
      if (signerId) await prisma.chainSigner.deleteMany({ where: { id: signerId } });
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      const adminIds = [adminId, secondAdminId, viewOnlyAdminId].filter(Boolean);
      await prisma.adminRole.deleteMany({ where: { adminId: { in: adminIds } } });
      await prisma.adminSession.deleteMany({ where: { adminId: { in: adminIds } } });
      if (roleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        await prisma.role.deleteMany({ where: { id: roleId } });
      }
      if (viewRoleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId: viewRoleId } });
        await prisma.role.deleteMany({ where: { id: viewRoleId } });
      }
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  let withdrawalId = '';

  it('requires login for withdrawal requests', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Idempotency-Key', `wd-${suffix}-anon`)
      .send({ toAddress: TO, amount: '10' });
    expect(res.status).toBe(401);
  });

  it('blocks KYC-unapproved users', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${kycPendingToken}`)
      .set('Idempotency-Key', `wd-${suffix}-kyc`)
      .send({ toAddress: TO, amount: '10' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('KYC_REQUIRED');
  });

  it('blocks frozen users', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${frozenToken}`)
      .set('Idempotency-Key', `wd-${suffix}-frozen-user`)
      .send({ toAddress: TO, amount: '10' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('blocks users with withdrawalsBlocked=true', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${blockedToken}`)
      .set('Idempotency-Key', `wd-${suffix}-blocked-user`)
      .send({ toAddress: TO, amount: '10' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WITHDRAWALS_BLOCKED');
  });

  it('blocks insufficient balance', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${lowBalanceToken}`)
      .set('Idempotency-Key', `wd-${suffix}-insufficient`)
      .send({ toAddress: TO, amount: '10' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('blocks withdrawals below the configured minimum', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wd-${suffix}-min`)
      .send({ toAddress: TO, amount: '1' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MINIMUM_AMOUNT_NOT_MET');
  });

  it('creates a withdrawal and holds funds (USER_AVAILABLE → USER_LOCKED)', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wd-${suffix}-1`)
      .send({ toAddress: TO, amount: '10' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_APPROVAL');
    expect(res.body.data.netAmount).toBe('9');
    withdrawalId = res.body.data.id;

    const bal = await usdt(userId);
    expect(bal.available).toBe('90');
    expect(bal.locked).toBe('10');
  });

  it('replays the original response for a duplicate idempotency key (no double hold)', async () => {
    const replay = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wd-${suffix}-1`)
      .send({ toAddress: TO, amount: '10' });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(withdrawalId);
    const bal = await usdt(userId);
    expect(bal.available).toBe('90'); // unchanged
    expect(bal.locked).toBe('10');
  });

  it('appears in the admin queue and can be approved', async () => {
    const queue = await request(app)
      .get('/admin/withdrawals')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(queue.status).toBe(200);
    const queued = queue.body.data.items.find((w: { id: string }) => w.id === withdrawalId);
    expect(queued).toBeTruthy();
    expect(queued.userEmail).toBe(email);
    expect(queued.userStatus).toBe('ACTIVE');

    const viewOnlyApprove = await request(app)
      .post(`/admin/withdrawals/${withdrawalId}/approve`)
      .set('Authorization', `Bearer ${viewOnlyToken}`);
    expect(viewOnlyApprove.status).toBe(403);

    const approve = await request(app)
      .post(`/admin/withdrawals/${withdrawalId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');

    const log = await prisma.adminLog.findFirst({
      where: { adminId, action: 'crypto.withdrawal.approved', targetId: withdrawalId },
    });
    expect(log).toBeTruthy();
  });

  it('requires maker-checker for large withdrawals', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${largeUserToken}`)
      .set('Idempotency-Key', `wd-${suffix}-large`)
      .send({ toAddress: TO, amount: '1000' });
    expect(res.status).toBe(201);
    const largeId = res.body.data.id;

    const first = await request(app)
      .post(`/admin/withdrawals/${largeId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('PENDING_APPROVAL');

    const afterFirst = await prisma.cryptoWithdrawal.findUniqueOrThrow({
      where: { id: largeId },
    });
    expect(afterFirst.approvedBy).toBe(adminId);
    expect(afterFirst.approvedBy2).toBeNull();

    const sameAdmin = await request(app)
      .post(`/admin/withdrawals/${largeId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sameAdmin.status).toBe(409);
    expect(sameAdmin.body.error.code).toBe('DUAL_CONTROL_SAME_APPROVER');

    const second = await request(app)
      .post(`/admin/withdrawals/${largeId}/approve`)
      .set('Authorization', `Bearer ${secondAdminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('APPROVED');

    const afterSecond = await prisma.cryptoWithdrawal.findUniqueOrThrow({
      where: { id: largeId },
    });
    expect(afterSecond.approvedBy).toBe(adminId);
    expect(afterSecond.approvedBy2).toBe(secondAdminId);
  });

  it('broadcasts via the mock signer with a sequenced nonce', async () => {
    const broadcast = await runBroadcastCycle(signer);
    expect(broadcast).toBe(1);

    const w = await prisma.cryptoWithdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    expect(w.status).toBe('BROADCAST');
    expect(w.txHash).toMatch(/^trxw_/);
    expect(w.nonce).toBe(0n);
    expect(w.fromAddress).toBe(`Thot_${suffix}`);

    // The nonce sequencer advanced.
    const nonce = await prisma.walletNonce.findUniqueOrThrow({ where: { hotWalletId } });
    expect(nonce.nextNonce).toBe(1n);
  });

  it('finalizes through the ledger once confirmed and releases the lock', async () => {
    const w = await prisma.cryptoWithdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    signer.confirm(w.txHash as string, reqConf);

    const result = await runConfirmationCycle(signer);
    expect(result.completed).toBe(1);

    const done = await prisma.cryptoWithdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    expect(done.status).toBe('COMPLETED');
    expect(done.finalTxnId).toBeTruthy();

    const bal = await usdt(userId);
    expect(bal.available).toBe('90');
    expect(bal.locked).toBe('0');

    const finalTxn = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { referenceType: 'crypto_withdrawal_final', referenceId: withdrawalId },
      include: { entries: true },
    });
    expect(finalTxn.kind).toBe('WITHDRAWAL_FINAL');
    expect(finalTxn.entries).toHaveLength(3); // user_locked debit, hot credit, fee credit
  });

  it('does NOT double-debit on a duplicate confirmation cycle', async () => {
    const result = await runConfirmationCycle(signer);
    expect(result.completed).toBe(0);
    const bal = await usdt(userId);
    expect(bal.available).toBe('90');
    const count = await prisma.ledgerTransaction.count({
      where: { referenceType: 'crypto_withdrawal_final', referenceId: withdrawalId },
    });
    expect(count).toBe(1); // exactly one final settlement, ever
  });

  it('releases the hold when a withdrawal is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wd-${suffix}-reject`)
      .send({ toAddress: TO, amount: '5' });
    expect(res.status).toBe(201);
    const rejectId = res.body.data.id;
    expect((await usdt(userId)).locked).toBe('5');

    const reject = await request(app)
      .post(`/admin/withdrawals/${rejectId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'manual review failed' });
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe('REJECTED');
    const log = await prisma.adminLog.findFirst({
      where: { adminId, action: 'crypto.withdrawal.rejected', targetId: rejectId },
    });
    expect(log?.reason).toBe('manual review failed');

    const bal = await usdt(userId);
    expect(bal.available).toBe('90'); // hold returned
    expect(bal.locked).toBe('0');
  });

  it('blocks withdrawals when the global freeze is on', async () => {
    await prisma.systemFlag.update({
      where: { key: 'withdrawals_frozen' },
      data: { value: { enabled: true } },
    });
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wd-${suffix}-frozen`)
      .send({ toAddress: TO, amount: '5' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WITHDRAWALS_FROZEN');
    await prisma.systemFlag.update({
      where: { key: 'withdrawals_frozen' },
      data: { value: { enabled: false } },
    });
  });

  it('enforces the destination allowlist', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wd-${suffix}-deny`)
      .send({ toAddress: NOT_ALLOWED, amount: '5' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ADDRESS_NOT_ALLOWLISTED');
  });

  it('rejects a public user token on admin withdrawal routes', async () => {
    const res = await request(app)
      .get('/admin/withdrawals')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });
});
