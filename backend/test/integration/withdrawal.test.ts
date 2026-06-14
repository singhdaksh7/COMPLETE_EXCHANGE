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
  const sessionId = randomUUID();
  const adminSessionId = randomUUID();
  const roleName = `WD_TEST_${suffix}`;
  const signer = createMockWithdrawalSigner();

  let userId = '';
  let adminId = '';
  let roleId = '';
  let hotWalletId = '';
  let signerId = '';
  let accessToken = '';
  let adminToken = '';
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

    // Admin authorized via seeded withdrawal.* permissions (not SUPER_ADMIN).
    const perms = await Promise.all(
      ['withdrawal.view', 'withdrawal.approve', 'withdrawal.reject'].map((code) =>
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
  });

  afterAll(async () => {
    try {
      await prisma.cryptoWithdrawal.deleteMany({ where: { userId } });
      await prisma.withdrawalAddress.deleteMany({ where: { userId } });
      await prisma.walletNonce.deleteMany({ where: { hotWalletId } });
      await prisma.hotWallet.deleteMany({ where: { id: hotWalletId } });
      await prisma.chainSigner.deleteMany({ where: { id: signerId } });
      await prisma.idempotencyKey.deleteMany({ where: { userId } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.adminRole.deleteMany({ where: { adminId } });
      await prisma.adminSession.deleteMany({ where: { adminId } });
      if (roleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        await prisma.role.deleteMany({ where: { id: roleId } });
      }
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  let withdrawalId = '';

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
    expect(queue.body.data.items.some((w: { id: string }) => w.id === withdrawalId)).toBe(true);

    const approve = await request(app)
      .post(`/admin/withdrawals/${withdrawalId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');
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
