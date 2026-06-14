import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { apiRouter } from '../../src/routes';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken } from '../../src/lib/jwt';
import { ledgerService } from '../../src/modules/ledger/ledger.service';

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
  app.use(errorHandler);
  return app;
}

d('ledger module (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const email = `ledger_${suffix}@example.com`;
  const sessionId = randomUUID();
  const refreshHash = `refresh_${suffix}`;
  const familyId = randomUUID();
  let userId = '';
  let accessToken = '';

  beforeAll(async () => {
    await prisma.asset.upsert({
      where: { symbol: 'INR' },
      update: {},
      create: { symbol: 'INR', name: 'Indian Rupee', kind: 'FIAT', decimals: 2 },
    });
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hash('Str0ngPassword'),
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
    await prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        refreshHash,
        familyId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    accessToken = signAccessToken({ sub: userId, sid: sessionId, kycTier: 0 });
  });

  afterAll(async () => {
    try {
      await prisma.idempotencyKey.deleteMany({ where: { userId } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.loginAttempt.deleteMany({ where: { userId } });
      // Do not delete user/accounts/ledger/audit rows. Ledger and audit tables
      // are append-only or referenced by append-only rows; email is unique per run.
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('posts balanced INR funding and exposes wallet balance', async () => {
    await ledgerService.post(
      {
        kind: 'TEST_INR_FUNDING',
        referenceType: 'integration_test',
        referenceId: randomUUID(),
        lines: [
          {
            kind: 'GATEWAY_CLEARING',
            userId: null,
            asset: 'INR',
            direction: 'DEBIT',
            amount: '100.00',
          },
          {
            kind: 'USER_AVAILABLE',
            userId,
            asset: 'INR',
            direction: 'CREDIT',
            amount: '100.00',
          },
        ],
      },
      { userId },
    );

    const wallet = await request(app)
      .get('/api/v1/wallets/INR')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(wallet.status).toBe(200);
    expect(wallet.body.data.available).toBe('100');
    expect(wallet.body.data.locked).toBe('0');
    expect(wallet.body.data.total).toBe('100');
  });

  it('posts user internal transfer idempotently and lists ledger entries', async () => {
    const key = `ledger-${suffix}-transfer`;
    const body = {
      asset: 'INR',
      amount: '25.00',
      fromKind: 'USER_AVAILABLE',
      toKind: 'USER_LOCKED',
      referenceType: 'integration_test_transfer',
      referenceId: randomUUID(),
    };

    const first = await request(app)
      .post('/api/v1/ledger/internal-transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const replay = await request(app)
      .post('/api/v1/ledger/internal-transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(first.body.data.id);

    const wallet = await request(app)
      .get('/api/v1/wallets/INR')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(wallet.body.data.available).toBe('75');
    expect(wallet.body.data.locked).toBe('25');

    const ledger = await request(app)
      .get('/api/v1/wallets/INR/ledger')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ledger.status).toBe(200);
    expect(ledger.body.data.items.length).toBeGreaterThanOrEqual(3);
    expect(
      ledger.body.data.items.some(
        (entry: { kind: string; direction: string; amount: string }) =>
          entry.kind === 'INTERNAL_TRANSFER' &&
          entry.direction === 'DEBIT' &&
          entry.amount === '25',
      ),
    ).toBe(true);
    expect(
      ledger.body.data.items.some(
        (entry: { kind: string; direction: string; amount: string }) =>
          entry.kind === 'INTERNAL_TRANSFER' &&
          entry.direction === 'CREDIT' &&
          entry.amount === '25',
      ),
    ).toBe(true);
  });

  it('rejects transfers that would make available balance negative', async () => {
    const res = await request(app)
      .post('/api/v1/ledger/internal-transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `ledger-${suffix}-insufficient`)
      .send({
        asset: 'INR',
        amount: '1000.00',
        fromKind: 'USER_AVAILABLE',
        toKind: 'USER_LOCKED',
        referenceType: 'integration_test_insufficient',
        referenceId: randomUUID(),
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('lists INR transaction history and reconciles account projection', async () => {
    const history = await request(app)
      .get('/api/v1/inr/transactions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(history.status).toBe(200);
    expect(Array.isArray(history.body.data.items)).toBe(true);

    const account = await prisma.account.findFirstOrThrow({
      where: { userId, asset: 'INR', kind: 'USER_AVAILABLE' },
    });
    const recon = await ledgerService.reconcileAccount(account.id);
    expect(recon.balanced).toBe(true);
    expect(recon.projection).toBe(recon.entries);
  });
});
