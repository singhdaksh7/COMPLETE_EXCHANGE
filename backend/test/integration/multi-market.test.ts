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

/**
 * Multi-market spot trading (Module 1) — proves the engine settles a NON-INR
 * pair (BTC-USDT: base = BTC, quote = USDT) entirely through the ledger, that
 * the public market-data projections work per market, and that an admin with
 * `market.manage` can halt/resume a market while `trading.view` alone cannot.
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
const SYMBOL = 'BTC-USDT';
const BASE = 'BTC';
const QUOTE = 'USDT';

d('Multi-market spot trading BTC/USDT (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const aEmail = `mmA_${suffix}@example.com`;
  const bEmail = `mmB_${suffix}@example.com`;
  const adminEmail = `mmAdmin_${suffix}@example.com`;
  const adminViewerEmail = `mmAdminView_${suffix}@example.com`;
  const roleName = `MM_TEST_${suffix}`;
  const viewerRoleName = `MM_VIEW_${suffix}`;

  let marketId = '';
  let aId = '';
  let bId = '';
  let adminId = '';
  let viewerAdminId = '';
  let roleId = '';
  let viewerRoleId = '';
  let aToken = '';
  let bToken = '';
  let adminToken = '';
  let viewerToken = '';

  let key = 0;
  const k = (): string => `mm-${suffix}-${(key += 1)}`;

  async function avail(userId: string, asset: string): Promise<Prisma.Decimal> {
    const w = await ledgerService.getWallet(userId, asset);
    return D(w.available);
  }
  async function locked(userId: string, asset: string): Promise<Prisma.Decimal> {
    const w = await ledgerService.getWallet(userId, asset);
    return D(w.locked);
  }
  async function systemBal(kind: string, asset: string): Promise<Prisma.Decimal> {
    const a = await prisma.account.findFirst({
      where: { kind: kind as never, userId: null, asset },
      include: { balance: true },
    });
    return D(a?.balance?.balance?.toFixed() ?? '0');
  }

  function place(token: string, body: Record<string, unknown>) {
    return request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', k())
      .send(body);
  }

  async function mkUser(email: string): Promise<{ id: string; token: string }> {
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
    const sid = randomUUID();
    await prisma.authSession.create({
      data: { id: sid, userId: user.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    return { id: user.id, token: signAccessToken({ sub: user.id, sid, kycTier: 1 }) };
  }

  async function mkAdmin(email: string, roleNm: string, perms: string[]): Promise<{ adminId: string; roleId: string; token: string }> {
    const role = await prisma.role.create({ data: { name: roleNm, scope: 'ADMIN', description: 'mm test' } });
    for (const code of perms) {
      const perm = await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
    const admin = await prisma.admin.create({ data: { email, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    await prisma.adminRole.create({ data: { adminId: admin.id, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId: admin.id, refreshHash: `ar_${randomUUID()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    return { adminId: admin.id, roleId: role.id, token: signAdminAccessToken({ sub: admin.id, sid: asid }) };
  }

  beforeAll(async () => {
    for (const [symbol, name, dec, kind] of [
      [QUOTE, 'Tether USD', 6, 'CRYPTO'],
      [BASE, 'Bitcoin', 8, 'CRYPTO'],
    ] as Array<[string, string, number, 'CRYPTO' | 'FIAT']>) {
      await prisma.asset.upsert({ where: { symbol }, update: {}, create: { symbol, name, kind, decimals: dec } });
    }

    const market = await prisma.market.upsert({
      where: { symbol: SYMBOL },
      update: { status: 'ACTIVE', makerFeeBps: 10, takerFeeBps: 20, tickSize: D('0.01'), stepSize: D('0.000001'), minNotional: D('10') },
      create: {
        symbol: SYMBOL,
        baseAsset: BASE,
        quoteAsset: QUOTE,
        status: 'ACTIVE',
        tickSize: D('0.01'),
        stepSize: D('0.000001'),
        minNotional: D('10'),
        makerFeeBps: 10,
        takerFeeBps: 20,
      },
    });
    marketId = market.id;

    // Start from an empty book — flip any resting order from a previous run.
    await prisma.order.updateMany({
      where: { marketId, status: { in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] } },
      data: { status: 'CANCELLED', closedAt: new Date() },
    });

    const a = await mkUser(aEmail);
    const b = await mkUser(bEmail);
    aId = a.id; aToken = a.token;
    bId = b.id; bToken = b.token;

    // Fund A and B with both assets (10 BTC + 100k USDT each).
    for (const uid of [aId, bId]) {
      await postLedger('TEST_FUNDING', [
        { kind: 'SYSTEM', userId: null, asset: QUOTE, direction: 'DEBIT', amount: '100000' },
        { kind: 'USER_AVAILABLE', userId: uid, asset: QUOTE, direction: 'CREDIT', amount: '100000' },
      ]);
      await postLedger('TEST_FUNDING', [
        { kind: 'SYSTEM', userId: null, asset: BASE, direction: 'DEBIT', amount: '10' },
        { kind: 'USER_AVAILABLE', userId: uid, asset: BASE, direction: 'CREDIT', amount: '10' },
      ]);
    }

    const admin = await mkAdmin(adminEmail, roleName, ['trading.view', 'market.manage']);
    adminId = admin.adminId; roleId = admin.roleId; adminToken = admin.token;
    const viewer = await mkAdmin(adminViewerEmail, viewerRoleName, ['trading.view']);
    viewerAdminId = viewer.adminId; viewerRoleId = viewer.roleId; viewerToken = viewer.token;
  });

  afterAll(async () => {
    try {
      await prisma.order.updateMany({
        where: { userId: { in: [aId, bId] }, status: { in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] } },
        data: { status: 'CANCELLED', closedAt: new Date() },
      });
      await prisma.market.updateMany({ where: { id: marketId }, data: { status: 'ACTIVE' } });
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: [aId, bId] } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: [aId, bId] } } });
      for (const aid of [adminId, viewerAdminId]) {
        await prisma.adminRole.deleteMany({ where: { adminId: aid } });
        await prisma.adminSession.deleteMany({ where: { adminId: aid } });
      }
      for (const rid of [roleId, viewerRoleId]) {
        if (!rid) continue;
        await prisma.rolePermission.deleteMany({ where: { roleId: rid } });
        await prisma.role.deleteMany({ where: { id: rid } });
      }
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('lists the BTC-USDT market with the seeded base/quote assets', async () => {
    const res = await request(app).get('/api/v1/markets');
    expect(res.status).toBe(200);
    const m = res.body.data.items.find((x: { symbol: string }) => x.symbol === SYMBOL);
    expect(m).toMatchObject({ baseAsset: BASE, quoteAsset: QUOTE, status: 'ACTIVE', takerFeeBps: 20 });
  });

  it('settles a BTC-USDT trade entirely in BTC + USDT (not INR), with fees', async () => {
    // A rests a SELL of 1 BTC @ 100 USDT (locks 1 BTC). B crosses with a BUY.
    const aBtc = await avail(aId, BASE);
    const aUsdt = await avail(aId, QUOTE);
    const bBtc = await avail(bId, BASE);
    const bUsdt = await avail(bId, QUOTE);
    const feeBtc = await systemBal('FEE_REVENUE', BASE);
    const feeUsdt = await systemBal('FEE_REVENUE', QUOTE);

    const sell = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '100.00', quantity: '1' });
    expect(sell.status).toBe(201);
    expect(sell.body.data.status).toBe('OPEN');
    expect(sell.body.data.lockedAsset).toBe(BASE);
    expect((await locked(aId, BASE)).toFixed()).toBe(D('1').toFixed());

    const buy = await place(bToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '100.00', quantity: '1' });
    expect(buy.status).toBe(201);
    expect(buy.body.data.status).toBe('FILLED');
    expect(buy.body.data.fills).toHaveLength(1);

    // Buyer (taker, 20bps on 1 BTC = 0.002): pays 100 USDT, receives 0.998 BTC.
    expect((await avail(bId, QUOTE)).toFixed()).toBe(bUsdt.sub('100').toFixed());
    expect((await avail(bId, BASE)).toFixed()).toBe(bBtc.add('0.998').toFixed());
    // Seller (maker, 10bps on 100 USDT = 0.1): receives 99.9 USDT and gives up
    // the 1 BTC (available 10→9 at the lock, then the locked 1 BTC settles out).
    expect((await avail(aId, QUOTE)).toFixed()).toBe(aUsdt.add('99.9').toFixed());
    expect((await avail(aId, BASE)).toFixed()).toBe(aBtc.sub('1').toFixed());
    expect((await locked(aId, BASE)).toFixed()).toBe('0');
    // Fee revenue accrues in BOTH market assets — never INR.
    expect((await systemBal('FEE_REVENUE', BASE)).toFixed()).toBe(feeBtc.add('0.002').toFixed());
    expect((await systemBal('FEE_REVENUE', QUOTE)).toFixed()).toBe(feeUsdt.add('0.1').toFixed());
    // No INR fee account should have been touched by a crypto/crypto trade.
    const trade = await prisma.trade.findFirstOrThrow({ where: { takerOrderId: buy.body.data.id } });
    expect(trade.makerFee.toFixed(6)).toBe('0.100000');
    expect(trade.takerFee.toFixed(8)).toBe('0.00200000');
  });

  it('annotates trade history with the correct (base/quote) fee asset', async () => {
    const trades = await request(app)
      .get(`/api/v1/trades?symbol=${SYMBOL}`)
      .set('Authorization', `Bearer ${bToken}`);
    expect(trades.status).toBe(200);
    const mine = trades.body.data.items[0];
    expect(mine.marketSymbol).toBe(SYMBOL);
    // B was the BUY taker → received BTC → fee charged in BTC.
    expect(mine.role).toBe('TAKER');
    expect(mine.side).toBe('BUY');
    expect(mine.feeAsset).toBe(BASE);
  });

  it('exposes order book, ticker, recent trades and candles for the new market', async () => {
    const rest = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '105.00', quantity: '2' });
    expect(rest.status).toBe(201);

    const book = await request(app).get(`/api/v1/markets/${SYMBOL}/orderbook?depth=10`);
    expect(book.status).toBe(200);
    expect(book.body.data.symbol).toBe(SYMBOL);
    expect(book.body.data.asks.find((l: { price: string }) => l.price === '105')).toMatchObject({ quantity: '2' });

    const ticker = await request(app).get(`/api/v1/markets/${SYMBOL}/ticker`);
    expect(ticker.status).toBe(200);
    expect(ticker.body.data.symbol).toBe(SYMBOL);
    expect(D(ticker.body.data.lastPrice).gt(0)).toBe(true);

    const tape = await request(app).get(`/api/v1/markets/${SYMBOL}/trades?limit=10`);
    expect(tape.status).toBe(200);
    expect(tape.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(tape.body.data.items[0]).not.toHaveProperty('fee');

    const candles = await request(app).get(`/api/v1/markets/${SYMBOL}/candles?interval=1m&limit=50`);
    expect(candles.status).toBe(200);
    expect(candles.body.data.symbol).toBe(SYMBOL);
    expect(candles.body.data.candles.length).toBeGreaterThanOrEqual(1);

    await request(app).delete(`/api/v1/orders/${rest.body.data.id}`).set('Authorization', `Bearer ${aToken}`);
  });

  it('lets a market.manage admin halt the market, blocking new orders', async () => {
    const halt = await request(app)
      .patch(`/admin/spot/markets/${SYMBOL}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'HALTED' });
    expect(halt.status).toBe(200);
    expect(halt.body.data.status).toBe('HALTED');

    const blocked = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '100.00', quantity: '1' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('MARKET_NOT_ACTIVE');

    // An admin log row was written for the status change.
    const logged = await prisma.adminLog.findFirst({
      where: { adminId, action: 'trading.admin_update_market' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(logged).toBeTruthy();
  });

  it('lets a market.manage admin resume the market', async () => {
    const resume = await request(app)
      .patch(`/admin/spot/markets/${SYMBOL}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });
    expect(resume.status).toBe(200);
    expect(resume.body.data.status).toBe('ACTIVE');

    const ok = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '100.00', quantity: '1' });
    expect(ok.status).toBe(201);
    await request(app).delete(`/api/v1/orders/${ok.body.data.id}`).set('Authorization', `Bearer ${aToken}`);
  });

  it('forbids an admin without market.manage from changing market status', async () => {
    const res = await request(app)
      .patch(`/admin/spot/markets/${SYMBOL}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ status: 'HALTED' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an invalid status value', async () => {
    const res = await request(app)
      .patch(`/admin/spot/markets/${SYMBOL}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'BOGUS' });
    expect(res.status).toBe(422);
  });
});
