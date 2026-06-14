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
import type { LedgerPostingLine } from '../../src/modules/ledger/ledger.types';

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

async function postLedger(kind: string, lines: LedgerPostingLine[]): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await ledgerService.post({ kind, referenceType: 'test_funding', referenceId: randomUUID(), lines });
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034' && attempt < 5) {
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

const D = (v: string | Prisma.Decimal): Prisma.Decimal => new Prisma.Decimal(v);

d('INR ↔ USDT conversion (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const email = `conv_${suffix}@example.com`;
  const nokycEmail = `convnokyc_${suffix}@example.com`;
  const adminEmail = `convadmin_${suffix}@example.com`;
  const sessionId = randomUUID();
  const nokycSessionId = randomUUID();
  const adminSessionId = randomUUID();
  const roleName = `CONV_TEST_${suffix}`;

  let userId = '';
  let nokycUserId = '';
  let adminId = '';
  let roleId = '';
  let accessToken = '';
  let nokycToken = '';
  let adminToken = '';

  async function userBal(asset: string): Promise<Prisma.Decimal> {
    const w = await ledgerService.listWallets(userId);
    return D(w.find((x) => x.asset.toUpperCase() === asset)?.available ?? '0');
  }
  async function systemBal(kind: string, asset: string): Promise<Prisma.Decimal> {
    const a = await prisma.account.findFirst({
      where: { kind: kind as never, userId: null, asset },
      include: { balance: true },
    });
    return D(a?.balance?.balance?.toFixed() ?? '0');
  }

  beforeAll(async () => {
    for (const [symbol, name, dec] of [['USDT', 'Tether USD', 6], ['INR', 'Indian Rupee', 2]] as Array<[string, string, number]>) {
      await prisma.asset.upsert({
        where: { symbol },
        update: {},
        create: { symbol, name, kind: symbol === 'INR' ? 'FIAT' : 'CRYPTO', decimals: dec },
      });
    }

    const user = await prisma.user.create({
      data: { email, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1 },
    });
    userId = user.id;
    await prisma.authSession.create({ data: { id: sessionId, userId, refreshHash: `r_${suffix}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    accessToken = signAccessToken({ sub: userId, sid: sessionId, kycTier: 1 });

    const nokyc = await prisma.user.create({
      data: { email: nokycEmail, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE', kycStatus: 'NOT_STARTED', kycTier: 0 },
    });
    nokycUserId = nokyc.id;
    await prisma.authSession.create({ data: { id: nokycSessionId, userId: nokyc.id, refreshHash: `rn_${suffix}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    nokycToken = signAccessToken({ sub: nokyc.id, sid: nokycSessionId, kycTier: 0 });

    // Fund the user (INR + USDT) and the platform LIQUIDITY treasury.
    await postLedger('TEST_FUNDING', [
      { kind: 'SYSTEM', userId: null, asset: 'INR', direction: 'DEBIT', amount: '10000' },
      { kind: 'USER_AVAILABLE', userId, asset: 'INR', direction: 'CREDIT', amount: '10000' },
    ]);
    await postLedger('TEST_FUNDING', [
      { kind: 'SYSTEM', userId: null, asset: 'USDT', direction: 'DEBIT', amount: '100' },
      { kind: 'USER_AVAILABLE', userId, asset: 'USDT', direction: 'CREDIT', amount: '100' },
    ]);
    await postLedger('TREASURY_FUNDING', [
      { kind: 'SYSTEM', userId: null, asset: 'INR', direction: 'DEBIT', amount: '100000' },
      { kind: 'LIQUIDITY', userId: null, asset: 'INR', direction: 'CREDIT', amount: '100000' },
    ]);
    await postLedger('TREASURY_FUNDING', [
      { kind: 'SYSTEM', userId: null, asset: 'USDT', direction: 'DEBIT', amount: '1000' },
      { kind: 'LIQUIDITY', userId: null, asset: 'USDT', direction: 'CREDIT', amount: '1000' },
    ]);

    // Admin authorized via the seeded 'inr.view' permission (not SUPER_ADMIN).
    const inrView = await prisma.permission.upsert({ where: { code: 'inr.view' }, update: {}, create: { code: 'inr.view', description: 'View INR' } });
    const role = await prisma.role.create({ data: { name: roleName, scope: 'ADMIN', description: 'conv test' } });
    roleId = role.id;
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: inrView.id } });
    const admin = await prisma.admin.create({ data: { email: adminEmail, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    adminId = admin.id;
    await prisma.adminRole.create({ data: { adminId, roleId: role.id } });
    await prisma.adminSession.create({ data: { id: adminSessionId, adminId, refreshHash: `ar_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    adminToken = signAdminAccessToken({ sub: adminId, sid: adminSessionId });
  });

  afterAll(async () => {
    try {
      await prisma.conversion.deleteMany({ where: { userId } });
      await prisma.priceQuote.deleteMany({ where: { userId } });
      await prisma.idempotencyKey.deleteMany({ where: { userId } });
      await prisma.authSession.deleteMany({ where: { userId: { in: [userId, nokycUserId] } } });
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

  let buyQuoteId = '';
  let buyUsdt = '';
  let buyFee = '';

  it('rejects quotes from a non-KYC user', async () => {
    const res = await request(app)
      .post('/api/v1/inr/quotes')
      .set('Authorization', `Bearer ${nokycToken}`)
      .send({ side: 'INR_TO_USDT', amount: '900' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('KYC_REQUIRED');
  });

  it('creates an INR→USDT quote with spread + fee preview', async () => {
    const res = await request(app)
      .post('/api/v1/inr/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ side: 'INR_TO_USDT', amount: '900' });
    expect(res.status).toBe(200);
    expect(res.body.data.rate).toBe('90.45');
    expect(res.body.data.inrAmount).toBe('900.00');
    expect(res.body.data.feeInr).toBe('1.80');
    buyQuoteId = res.body.data.id;
    buyUsdt = res.body.data.usdtAmount;
    buyFee = res.body.data.feeInr;
  });

  it('executes INR→USDT atomically through the ledger', async () => {
    const inrBefore = await userBal('INR');
    const usdtBefore = await userBal('USDT');
    const liqUsdtBefore = await systemBal('LIQUIDITY', 'USDT');
    const feeBefore = await systemBal('FEE_REVENUE', 'INR');

    const res = await request(app)
      .post('/api/v1/inr/conversions')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `conv-${suffix}-buy`)
      .send({ quoteId: buyQuoteId });
    expect(res.status).toBe(201);
    expect(res.body.data.usdtAmount).toBe(buyUsdt);

    expect((await userBal('INR')).toFixed()).toBe(inrBefore.sub('900').toFixed());
    expect((await userBal('USDT')).toFixed()).toBe(usdtBefore.add(buyUsdt).toFixed());
    expect((await systemBal('LIQUIDITY', 'USDT')).toFixed()).toBe(liqUsdtBefore.sub(buyUsdt).toFixed());
    expect((await systemBal('FEE_REVENUE', 'INR')).toFixed()).toBe(feeBefore.add(buyFee).toFixed());

    const conv = await prisma.conversion.findFirstOrThrow({ where: { quoteId: buyQuoteId } });
    expect(conv.ledgerTxnId).toBeTruthy();
  });

  it('does NOT double-convert a quote that was already used', async () => {
    const inrBefore = await userBal('INR');
    const res = await request(app)
      .post('/api/v1/inr/conversions')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `conv-${suffix}-buy-again`) // different key, same quote
      .send({ quoteId: buyQuoteId });
    expect(res.status).toBe(201);
    // Returns the original conversion; no new balance movement.
    expect((await userBal('INR')).toFixed()).toBe(inrBefore.toFixed());
    const count = await prisma.conversion.count({ where: { quoteId: buyQuoteId } });
    expect(count).toBe(1);
  });

  it('replays the original response for a duplicate idempotency key', async () => {
    const replay = await request(app)
      .post('/api/v1/inr/conversions')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `conv-${suffix}-buy`)
      .send({ quoteId: buyQuoteId });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
  });

  it('executes USDT→INR withholding fee + §194S TDS', async () => {
    const quote = await request(app)
      .post('/api/v1/inr/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ side: 'USDT_TO_INR', amount: '10' });
    expect(quote.status).toBe(200);
    expect(quote.body.data.rate).toBe('89.55');
    const { id: quoteId, inrAmount: net, tdsAmount, usdtAmount } = quote.body.data;
    expect(tdsAmount).toBe('8.95');

    const inrBefore = await userBal('INR');
    const usdtBefore = await userBal('USDT');
    const tdsBefore = await systemBal('TDS_PAYABLE', 'INR');

    const res = await request(app)
      .post('/api/v1/inr/conversions')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `conv-${suffix}-sell`)
      .send({ quoteId });
    expect(res.status).toBe(201);

    expect((await userBal('USDT')).toFixed()).toBe(usdtBefore.sub(usdtAmount).toFixed());
    expect((await userBal('INR')).toFixed()).toBe(inrBefore.add(net).toFixed());
    expect((await systemBal('TDS_PAYABLE', 'INR')).toFixed()).toBe(tdsBefore.add(tdsAmount).toFixed());
  });

  it('rejects an expired quote', async () => {
    const quote = await request(app)
      .post('/api/v1/inr/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ side: 'INR_TO_USDT', amount: '100' });
    const quoteId = quote.body.data.id;
    await prisma.priceQuote.update({ where: { id: quoteId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app)
      .post('/api/v1/inr/conversions')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `conv-${suffix}-exp`)
      .send({ quoteId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('QUOTE_EXPIRED');
  });

  it('rejects when treasury liquidity is insufficient', async () => {
    const quote = await request(app)
      .post('/api/v1/inr/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ side: 'INR_TO_USDT', amount: '10000000' }); // needs ~110k USDT > 1000
    const quoteId = quote.body.data.id;

    const res = await request(app)
      .post('/api/v1/inr/conversions')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `conv-${suffix}-liq`)
      .send({ quoteId });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('INSUFFICIENT_LIQUIDITY');
  });

  it('lists conversion history and admin monitoring', async () => {
    const history = await request(app)
      .get('/api/v1/inr/conversions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data.items.length).toBeGreaterThanOrEqual(2);

    const admin = await request(app)
      .get(`/admin/conversions?userId=${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(admin.status).toBe(200);
    expect(admin.body.data.items.some((c: { id: string }) => c.id === history.body.data.items[0].id)).toBe(true);
  });

  it('rejects a public user token on admin conversion routes', async () => {
    const res = await request(app)
      .get('/admin/conversions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });
});
