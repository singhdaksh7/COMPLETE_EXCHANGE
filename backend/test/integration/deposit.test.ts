import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { createHmac, randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { apiRouter } from '../../src/routes';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken } from '../../src/lib/jwt';
import { config } from '../../src/config';

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

/** Mirror the production app's raw-body capture so webhook HMAC works. */
function buildApp(): Express {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(requestContext);
  app.use('/api/v1', apiRouter);
  app.use(errorHandler);
  return app;
}

function paymentSignature(orderId: string, paymentId: string): string {
  return createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function buildCapturedWebhook(p: {
  orderId: string;
  paymentId: string;
  amountPaise: number;
}) {
  const body = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: p.paymentId,
          order_id: p.orderId,
          amount: p.amountPaise,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  };
  const raw = JSON.stringify(body);
  const signature = createHmac('sha256', config.razorpay.webhookSecret)
    .update(raw)
    .digest('hex');
  return { raw, signature };
}

d('INR Razorpay deposit (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const email = `deposit_${suffix}@example.com`;
  const sessionId = randomUUID();
  const eventId = `evt_${suffix}`;
  let userId = '';
  let accessToken = '';
  let inrTransactionId = '';
  let providerOrderId = '';
  const paymentId = `pay_${suffix}`;

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
  });

  afterAll(async () => {
    try {
      // payment_webhook_events is append-only (DB trigger forbids DELETE); the
      // per-run unique event id keeps test runs from colliding instead.
      await prisma.inrTransaction.deleteMany({ where: { userId } });
      await prisma.idempotencyKey.deleteMany({ where: { userId } });
      await prisma.authSession.deleteMany({ where: { userId } });
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('creates a Razorpay order for an approved user', async () => {
    const res = await request(app)
      .post('/api/v1/inr/deposits')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `dep-${suffix}-create`)
      .send({ amount: '500.00' });

    expect(res.status).toBe(201);
    expect(res.body.data.provider).toBe('razorpay');
    expect(res.body.data.providerOrderId).toMatch(/^order_/);
    expect(res.body.data.amount).toBe('500.00');
    expect(res.body.data.status).toBe('INITIATED');
    inrTransactionId = res.body.data.inrTransactionId;
    providerOrderId = res.body.data.providerOrderId;
  });

  it('rejects an unverified KYC user (separate user)', async () => {
    const u = await prisma.user.create({
      data: {
        email: `nokyc_${suffix}@example.com`,
        passwordHash: await hash('Str0ngPassword'),
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
        kycStatus: 'NOT_STARTED',
        kycTier: 0,
      },
    });
    const sid = randomUUID();
    await prisma.authSession.create({
      data: {
        id: sid,
        userId: u.id,
        refreshHash: `refresh_nokyc_${suffix}`,
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const token = signAccessToken({ sub: u.id, sid, kycTier: 0 });
    const res = await request(app)
      .post('/api/v1/inr/deposits')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `dep-${suffix}-nokyc`)
      .send({ amount: '500.00' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('KYC_REQUIRED');

    await prisma.idempotencyKey.deleteMany({ where: { userId: u.id } });
    await prisma.authSession.deleteMany({ where: { userId: u.id } });
    await prisma.inrTransaction.deleteMany({ where: { userId: u.id } });
  });

  it('verifies the payment signature and advances to PENDING', async () => {
    const res = await request(app)
      .post('/api/v1/inr/deposits/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: providerOrderId,
        paymentId,
        signature: paymentSignature(providerOrderId, paymentId),
      });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.providerPaymentId).toBe(paymentId);
  });

  it('rejects a forged payment signature', async () => {
    const res = await request(app)
      .post('/api/v1/inr/deposits/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ orderId: providerOrderId, paymentId, signature: 'deadbeef' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('credits the INR wallet via the ledger on a signed webhook', async () => {
    const { raw, signature } = buildCapturedWebhook({
      orderId: providerOrderId,
      paymentId,
      amountPaise: 50000,
    });
    const res = await request(app)
      .post('/api/v1/inr/deposits/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.duplicate).toBe(false);

    const wallet = await request(app)
      .get('/api/v1/wallets/INR')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(wallet.status).toBe(200);
    expect(wallet.body.data.available).toBe('500');
  });

  it('rejects a webhook with an invalid signature', async () => {
    const { raw } = buildCapturedWebhook({
      orderId: providerOrderId,
      paymentId,
      amountPaise: 50000,
    });
    const res = await request(app)
      .post('/api/v1/inr/deposits/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'invalid')
      .set('x-razorpay-event-id', `${eventId}-bad`)
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
  });

  it('does NOT double-credit on a duplicate webhook delivery', async () => {
    const { raw, signature } = buildCapturedWebhook({
      orderId: providerOrderId,
      paymentId,
      amountPaise: 50000,
    });
    const res = await request(app)
      .post('/api/v1/inr/deposits/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId) // same delivery id → idempotent replay
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);

    const wallet = await request(app)
      .get('/api/v1/wallets/INR')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(wallet.body.data.available).toBe('500'); // unchanged
  });

  it('tracks deposit status and surfaces it in INR history', async () => {
    const detail = await request(app)
      .get(`/api/v1/inr/deposits/${inrTransactionId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('SUCCESS');
    expect(detail.body.data.ledgerTxnId).toBeTruthy();

    const history = await request(app)
      .get('/api/v1/inr/transactions?type=DEPOSIT')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(history.status).toBe(200);
    expect(
      history.body.data.items.some(
        (t: { id: string; status: string }) =>
          t.id === inrTransactionId && t.status === 'SUCCESS',
      ),
    ).toBe(true);
  });
});
