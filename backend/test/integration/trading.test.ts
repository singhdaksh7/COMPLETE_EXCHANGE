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
const SYMBOL = 'USDT-INR';

d('Spot trading USDT/INR (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const aEmail = `spotA_${suffix}@example.com`;
  const bEmail = `spotB_${suffix}@example.com`;
  const cEmail = `spotC_${suffix}@example.com`;
  const nokycEmail = `spotN_${suffix}@example.com`;
  const adminEmail = `spotAdmin_${suffix}@example.com`;
  const roleName = `SPOT_TEST_${suffix}`;

  let marketId = '';
  let aId = '';
  let bId = '';
  let cId = '';
  let nokycId = '';
  let adminId = '';
  let roleId = '';
  let aToken = '';
  let bToken = '';
  let cToken = '';
  let nokycToken = '';
  let adminToken = '';

  let key = 0;
  const k = (): string => `spot-${suffix}-${(key += 1)}`;

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

  async function mkUser(email: string, kyc: boolean): Promise<{ id: string; token: string }> {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hash('Str0ngPassword'),
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
        kycStatus: kyc ? 'APPROVED' : 'NOT_STARTED',
        kycTier: kyc ? 1 : 0,
      },
    });
    const sid = randomUUID();
    await prisma.authSession.create({
      data: { id: sid, userId: user.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    return { id: user.id, token: signAccessToken({ sub: user.id, sid, kycTier: kyc ? 1 : 0 }) };
  }

  beforeAll(async () => {
    for (const [symbol, name, dec, kind] of [
      ['USDT', 'Tether USD', 6, 'CRYPTO'],
      ['INR', 'Indian Rupee', 2, 'FIAT'],
    ] as Array<[string, string, number, 'CRYPTO' | 'FIAT']>) {
      await prisma.asset.upsert({ where: { symbol }, update: {}, create: { symbol, name, kind, decimals: dec } });
    }

    const market = await prisma.market.upsert({
      where: { symbol: SYMBOL },
      update: { status: 'ACTIVE', makerFeeBps: 10, takerFeeBps: 20, tickSize: D('0.01'), stepSize: D('0.000001'), minNotional: D('10') },
      create: {
        symbol: SYMBOL,
        baseAsset: 'USDT',
        quoteAsset: 'INR',
        status: 'ACTIVE',
        tickSize: D('0.01'),
        stepSize: D('0.000001'),
        minNotional: D('10'),
        makerFeeBps: 10,
        takerFeeBps: 20,
      },
    });
    marketId = market.id;

    // Start with an empty book. `trades` is append-only (a DB trigger rejects
    // DELETE) and orders that have trades are FK-referenced by them, so we do
    // NOT delete — we flip any resting order left by a previous run to a closed
    // status, which is enough to take it out of the book. Stale trades are
    // harmless to the assertions below (they only ever count "at least N").
    await prisma.order.updateMany({
      where: { marketId, status: { in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] } },
      data: { status: 'CANCELLED', closedAt: new Date() },
    });

    const a = await mkUser(aEmail, true);
    const b = await mkUser(bEmail, true);
    const c = await mkUser(cEmail, true);
    const n = await mkUser(nokycEmail, false);
    aId = a.id; aToken = a.token;
    bId = b.id; bToken = b.token;
    cId = c.id; cToken = c.token; // KYC-approved but intentionally UNFUNDED
    nokycId = n.id; nokycToken = n.token;

    // Fund A and B generously with both assets.
    for (const uid of [aId, bId]) {
      await postLedger('TEST_FUNDING', [
        { kind: 'SYSTEM', userId: null, asset: 'INR', direction: 'DEBIT', amount: '1000000' },
        { kind: 'USER_AVAILABLE', userId: uid, asset: 'INR', direction: 'CREDIT', amount: '1000000' },
      ]);
      await postLedger('TEST_FUNDING', [
        { kind: 'SYSTEM', userId: null, asset: 'USDT', direction: 'DEBIT', amount: '1000' },
        { kind: 'USER_AVAILABLE', userId: uid, asset: 'USDT', direction: 'CREDIT', amount: '1000' },
      ]);
    }

    // Admin authorized via 'trading.view' (not SUPER_ADMIN).
    const perm = await prisma.permission.upsert({ where: { code: 'trading.view' }, update: {}, create: { code: 'trading.view', description: 'View trading' } });
    const role = await prisma.role.create({ data: { name: roleName, scope: 'ADMIN', description: 'spot test' } });
    roleId = role.id;
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    const admin = await prisma.admin.create({ data: { email: adminEmail, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    adminId = admin.id;
    await prisma.adminRole.create({ data: { adminId, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId, refreshHash: `ar_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    adminToken = signAdminAccessToken({ sub: adminId, sid: asid });
  });

  afterAll(async () => {
    try {
      // Take this run's resting orders out of the book (cannot delete: trades
      // are append-only and FK-reference their orders).
      await prisma.order.updateMany({
        where: { userId: { in: [aId, bId, cId] }, status: { in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] } },
        data: { status: 'CANCELLED', closedAt: new Date() },
      });
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: [aId, bId, cId] } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: [aId, bId, cId, nokycId] } } });
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

  it('rejects orders from a non-KYC user', async () => {
    const res = await place(nokycToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '90.00', quantity: '1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('KYC_REQUIRED');
  });

  it('lists markets', async () => {
    const res = await request(app).get('/api/v1/markets');
    expect(res.status).toBe(200);
    const m = res.body.data.items.find((x: { symbol: string }) => x.symbol === SYMBOL);
    expect(m).toMatchObject({ baseAsset: 'USDT', quoteAsset: 'INR', status: 'ACTIVE', takerFeeBps: 20 });
  });

  it('rejects an order below the minimum notional', async () => {
    const res = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '90.00', quantity: '0.05' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BELOW_MIN_NOTIONAL');
  });

  it('places a LIMIT SELL that rests on the book and locks USDT', async () => {
    const availBefore = await avail(aId, 'USDT');
    const lockedBefore = await locked(aId, 'USDT');
    const res = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '90.00', quantity: '10' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('OPEN');
    expect((await avail(aId, 'USDT')).toFixed()).toBe(availBefore.sub('10').toFixed());
    expect((await locked(aId, 'USDT')).toFixed()).toBe(lockedBefore.add('10').toFixed());
  });

  it('matches a crossing LIMIT BUY: full fill, ledger settlement, fees', async () => {
    const aUsdt = await avail(aId, 'USDT');
    const aInr = await avail(aId, 'INR');
    const bInr = await avail(bId, 'INR');
    const bUsdt = await avail(bId, 'USDT');
    const feeUsdt = await systemBal('FEE_REVENUE', 'USDT');
    const feeInr = await systemBal('FEE_REVENUE', 'INR');

    const res = await place(bToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '90.00', quantity: '10' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FILLED');
    expect(res.body.data.fills).toHaveLength(1);

    // Buyer (taker, 20bps on 10 USDT = 0.02): pays 900 INR, receives 9.98 USDT.
    expect((await avail(bId, 'INR')).toFixed()).toBe(bInr.sub('900').toFixed());
    expect((await avail(bId, 'USDT')).toFixed()).toBe(bUsdt.add('9.98').toFixed());
    // Seller (maker, 10bps on 900 INR = 0.90): receives 899.10 INR; locked USDT settles out.
    expect((await avail(aId, 'INR')).toFixed()).toBe(aInr.add('899.10').toFixed());
    expect((await avail(aId, 'USDT')).toFixed()).toBe(aUsdt.toFixed());
    expect((await locked(aId, 'USDT')).toFixed()).toBe('0');
    // Fee revenue.
    expect((await systemBal('FEE_REVENUE', 'USDT')).toFixed()).toBe(feeUsdt.add('0.02').toFixed());
    expect((await systemBal('FEE_REVENUE', 'INR')).toFixed()).toBe(feeInr.add('0.90').toFixed());

    const trade = await prisma.trade.findFirstOrThrow({ where: { takerOrderId: res.body.data.id } });
    expect(trade.settleTxnId).toBeTruthy();
    expect(trade.makerFee.toFixed(2)).toBe('0.90');
    expect(trade.takerFee.toFixed(6)).toBe('0.020000');
  });

  it('gives the taker price improvement and releases the surplus lock', async () => {
    // A rests a SELL at 89; B buys with a generous 95 limit → executes at 89.
    const sell = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '89.00', quantity: '5' });
    expect(sell.status).toBe(201);

    const bInr = await avail(bId, 'INR');
    const bInrLocked = await locked(bId, 'INR');
    const res = await place(bToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '95.00', quantity: '5' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FILLED');
    // Locked 475 (95×5, rounded), spent 445 (89×5), 30 surplus released → net −445.
    expect((await avail(bId, 'INR')).toFixed()).toBe(bInr.sub('445').toFixed());
    expect((await locked(bId, 'INR')).toFixed()).toBe(bInrLocked.toFixed());
  });

  it('exposes the aggregated order book', async () => {
    const rest = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '99.00', quantity: '3' });
    expect(rest.status).toBe(201);
    const res = await request(app).get(`/api/v1/markets/${SYMBOL}/orderbook?depth=10`);
    expect(res.status).toBe(200);
    const ask = res.body.data.asks.find((l: { price: string }) => l.price === '99');
    expect(ask).toMatchObject({ price: '99', quantity: '3' });

    // Cancel it: releases the 3 USDT lock.
    const lockedBefore = await locked(aId, 'USDT');
    const cancel = await request(app)
      .delete(`/api/v1/orders/${rest.body.data.id}`)
      .set('Authorization', `Bearer ${aToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
    expect((await locked(aId, 'USDT')).toFixed()).toBe(lockedBefore.sub('3').toFixed());
  });

  it('executes a MARKET BUY against the budget', async () => {
    await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '90.00', quantity: '2' });
    const bInr = await avail(bId, 'INR');
    const bUsdt = await avail(bId, 'USDT');
    const res = await place(bToken, { symbol: SYMBOL, side: 'BUY', type: 'MARKET', quoteBudget: '180.00' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FILLED');
    expect((await avail(bId, 'INR')).toFixed()).toBe(bInr.sub('180').toFixed());
    expect((await avail(bId, 'USDT')).toFixed()).toBe(bUsdt.add('1.996').toFixed()); // 2 − 0.004 fee
  });

  it('executes a MARKET SELL against resting bids', async () => {
    await place(aToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '88.00', quantity: '3' });
    const bUsdt = await avail(bId, 'USDT');
    const bInr = await avail(bId, 'INR');
    const res = await place(bToken, { symbol: SYMBOL, side: 'SELL', type: 'MARKET', quantity: '3' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FILLED');
    expect((await avail(bId, 'USDT')).toFixed()).toBe(bUsdt.sub('3').toFixed());
    // Receives 264 INR − 0.52 taker fee (20bps).
    expect((await avail(bId, 'INR')).toFixed()).toBe(bInr.add('263.48').toFixed());
  });

  it('partially fills a resting order and releases the remainder on cancel', async () => {
    const sell = await place(aToken, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '91.00', quantity: '10' });
    expect(sell.status).toBe(201);
    const buy = await place(bToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '91.00', quantity: '4' });
    expect(buy.status).toBe(201);
    expect(buy.body.data.status).toBe('FILLED');

    const maker = await prisma.order.findFirstOrThrow({ where: { id: sell.body.data.id } });
    expect(maker.status).toBe('PARTIALLY_FILLED');
    expect(maker.filledQuantity.toFixed(6)).toBe('4.000000');

    const lockedBefore = await locked(aId, 'USDT');
    const cancel = await request(app)
      .delete(`/api/v1/orders/${sell.body.data.id}`)
      .set('Authorization', `Bearer ${aToken}`);
    expect(cancel.status).toBe(200);
    // 6 USDT remained locked (10 − 4 filled) and is released.
    expect((await locked(aId, 'USDT')).toFixed()).toBe(lockedBefore.sub('6').toFixed());
  });

  it('rejects an order with insufficient balance and marks it REJECTED', async () => {
    const res = await place(cToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '90.00', quantity: '1' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    const rejected = await prisma.order.findFirst({ where: { userId: cId }, orderBy: { createdAt: 'desc' } });
    expect(rejected?.status).toBe('REJECTED');
  });

  it('de-duplicates by clientOrderId (no double create)', async () => {
    const coid = `coid-${suffix}`;
    const first = await place(bToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '50.00', quantity: '1', clientOrderId: coid });
    expect(first.status).toBe(201);
    const second = await place(bToken, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '50.00', quantity: '1', clientOrderId: coid });
    expect(second.body.data.id).toBe(first.body.data.id);
    const count = await prisma.order.count({ where: { userId: bId, clientOrderId: coid } });
    expect(count).toBe(1);

    await request(app).delete(`/api/v1/orders/${first.body.data.id}`).set('Authorization', `Bearer ${bToken}`);
  });

  it('replays the original response for a duplicate Idempotency-Key', async () => {
    const idem = `idem-${suffix}-replay`;
    const body = { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '50.00', quantity: '1' };
    const first = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${bToken}`)
      .set('Idempotency-Key', idem)
      .send(body);
    expect(first.status).toBe(201);
    const replay = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${bToken}`)
      .set('Idempotency-Key', idem)
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(first.body.data.id);

    await request(app).delete(`/api/v1/orders/${first.body.data.id}`).set('Authorization', `Bearer ${bToken}`);
  });

  it('lists open orders, order history and trade history', async () => {
    const open = await request(app)
      .get('/api/v1/orders/open')
      .set('Authorization', `Bearer ${bToken}`);
    expect(open.status).toBe(200);
    expect(Array.isArray(open.body.data.items)).toBe(true);

    const history = await request(app)
      .get(`/api/v1/orders?symbol=${SYMBOL}`)
      .set('Authorization', `Bearer ${bToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data.items.length).toBeGreaterThanOrEqual(3);

    const trades = await request(app)
      .get(`/api/v1/trades?symbol=${SYMBOL}`)
      .set('Authorization', `Bearer ${bToken}`);
    expect(trades.status).toBe(200);
    expect(trades.body.data.items.length).toBeGreaterThanOrEqual(3);
    expect(trades.body.data.items[0].role).toBeTruthy();
  });

  it('exposes the public recent-trades tape without user data', async () => {
    const res = await request(app).get(`/api/v1/markets/${SYMBOL}/trades?limit=10`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
    const t = items[0];
    // Only public fields are present — never user ids, fees, role, or order ids.
    expect(t).toHaveProperty('price');
    expect(t).toHaveProperty('quantity');
    expect(t).toHaveProperty('side');
    expect(t).toHaveProperty('executedAt');
    expect(t).not.toHaveProperty('makerUserId');
    expect(t).not.toHaveProperty('takerUserId');
    expect(t).not.toHaveProperty('fee');
    expect(t).not.toHaveProperty('role');
    expect(t).not.toHaveProperty('makerOrderId');
  });

  it('exposes the public 24h ticker', async () => {
    const res = await request(app).get(`/api/v1/markets/${SYMBOL}/ticker`);
    expect(res.status).toBe(200);
    const tk = res.body.data;
    expect(tk.symbol).toBe(SYMBOL);
    expect(tk.lastPrice).toBeTruthy();
    expect(tk.tradeCount24h).toBeGreaterThanOrEqual(3);
    expect(D(tk.high24h).gte(D(tk.low24h))).toBe(true);
    expect(D(tk.baseVolume24h).gt(0)).toBe(true);
    expect(D(tk.quoteVolume24h).gt(0)).toBe(true);
    // priceChange = lastPrice − open24h (quote-scaled), with a 2dp percentage.
    expect(typeof tk.priceChangePct).toBe('string');
    expect(tk.priceChange).toBe(D(tk.lastPrice).sub(D(tk.open24h)).toFixed(2));
  });

  it('computes OHLCV candles from the trades tape', async () => {
    const res = await request(app).get(`/api/v1/markets/${SYMBOL}/candles?interval=1m&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.data.symbol).toBe(SYMBOL);
    expect(res.body.data.interval).toBe('1m');
    const candles = res.body.data.candles;
    expect(Array.isArray(candles)).toBe(true);
    expect(candles.length).toBeGreaterThanOrEqual(1);
    for (const c of candles) {
      expect(D(c.high).gte(D(c.open))).toBe(true);
      expect(D(c.high).gte(D(c.close))).toBe(true);
      expect(D(c.low).lte(D(c.open))).toBe(true);
      expect(D(c.low).lte(D(c.close))).toBe(true);
      expect(D(c.baseVolume).gt(0)).toBe(true);
      expect(c.tradeCount).toBeGreaterThanOrEqual(1);
    }
    // Buckets are strictly ascending by openTime.
    for (let i = 1; i < candles.length; i += 1) {
      expect(new Date(candles[i].openTime).getTime()).toBeGreaterThan(
        new Date(candles[i - 1].openTime).getTime(),
      );
    }
  });

  it('rejects an invalid candle interval and unknown markets', async () => {
    const bad = await request(app).get(`/api/v1/markets/${SYMBOL}/candles?interval=2h`);
    expect(bad.status).toBe(422);
    const missing = await request(app).get('/api/v1/markets/FOO-BAR/ticker');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('MARKET_NOT_FOUND');
  });

  it('admin monitors markets, orders and trades', async () => {
    const markets = await request(app).get('/admin/spot/markets').set('Authorization', `Bearer ${adminToken}`);
    expect(markets.status).toBe(200);
    expect(markets.body.data.items.some((m: { symbol: string }) => m.symbol === SYMBOL)).toBe(true);

    const orders = await request(app).get(`/admin/spot/orders?userId=${bId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(orders.status).toBe(200);
    expect(orders.body.data.items.length).toBeGreaterThanOrEqual(1);

    const trades = await request(app).get(`/admin/spot/trades?symbol=${SYMBOL}`).set('Authorization', `Bearer ${adminToken}`);
    expect(trades.status).toBe(200);
    expect(trades.body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a public user token on admin trading routes', async () => {
    const res = await request(app).get('/admin/spot/orders').set('Authorization', `Bearer ${bToken}`);
    expect(res.status).toBe(401);
  });
});
