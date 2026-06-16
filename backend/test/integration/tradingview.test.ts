import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { apiRouter } from '../../src/routes';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';

/**
 * TradingView UDF datafeed endpoints (Phase 5.4). Self-contained: creates a
 * unique market + one trade so history is deterministic and isolated from other
 * suites. Reuses the existing candle bucketing — no new market data.
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
  app.use(errorHandler);
  return app;
}

const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);

d('TradingView datafeed (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const BASE = `TVB${suffix}`.toUpperCase();
  const SYMBOL = `${BASE}-USDT`;
  const tradeAt = new Date(Math.floor(Date.now() / 1000) * 1000 - 120_000); // 2 min ago, sec-aligned

  let marketId = '';
  const userIds: string[] = [];
  const orderIds: string[] = [];

  beforeAll(async () => {
    for (const [symbol, name, dec] of [
      ['USDT', 'Tether USD', 6],
      [BASE, 'Test Coin B', 8],
    ] as Array<[string, string, number]>) {
      await prisma.asset.upsert({ where: { symbol }, update: {}, create: { symbol, name, kind: 'CRYPTO', decimals: dec } });
    }
    const market = await prisma.market.create({
      data: {
        symbol: SYMBOL, baseAsset: BASE, quoteAsset: 'USDT', status: 'ACTIVE',
        tickSize: D('0.01'), stepSize: D('0.000001'), minNotional: D('10'), makerFeeBps: 10, takerFeeBps: 20,
      },
    });
    marketId = market.id;

    const a = await prisma.user.create({ data: { email: `tv_a_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), status: 'ACTIVE' } });
    const b = await prisma.user.create({ data: { email: `tv_b_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), status: 'ACTIVE' } });
    userIds.push(a.id, b.id);
    const maker = await prisma.order.create({ data: { userId: a.id, marketId, side: 'SELL', type: 'LIMIT', price: D('100'), quantity: D('2'), status: 'FILLED' } });
    const taker = await prisma.order.create({ data: { userId: b.id, marketId, side: 'BUY', type: 'LIMIT', price: D('100'), quantity: D('2'), status: 'FILLED' } });
    orderIds.push(maker.id, taker.id);
    await prisma.trade.create({
      data: {
        fillId: `tvfill_${suffix}`, marketId, makerOrderId: maker.id, takerOrderId: taker.id,
        makerUserId: a.id, takerUserId: b.id, price: D('100'), quantity: D('2'), quoteAmount: D('200'),
        makerSide: 'SELL', executedAt: tradeAt,
      },
    });
  });

  afterAll(async () => {
    // `trades` is append-only (a DB trigger rejects DELETE) and orders/market/
    // users are FK-referenced by it, so — like the trading suite — we do NOT
    // delete. The market symbol + base asset are unique per run, so the retained
    // rows never collide with another run.
    void marketId; void orderIds; void userIds;
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('GET /config advertises the datafeed capabilities', async () => {
    const res = await request(app).get('/api/v1/tradingview/config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      supports_search: true,
      supports_group_request: false,
      supports_marks: false,
      supports_timescale_marks: false,
      supports_time: true,
    });
    expect(res.body.supported_resolutions).toEqual(['1', '5', '15', '30', '60', '240', '1D']);
  });

  it('GET /time returns a Unix timestamp', async () => {
    const res = await request(app).get('/api/v1/tradingview/time');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('number');
    expect(Math.abs(res.body - Math.floor(Date.now() / 1000))).toBeLessThan(10);
  });

  it('GET /search returns matching symbols', async () => {
    const res = await request(app).get(`/api/v1/tradingview/search?query=${BASE}&limit=10`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const m = res.body.find((r: { symbol: string }) => r.symbol === SYMBOL);
    expect(m).toMatchObject({ full_name: SYMBOL, ticker: SYMBOL, exchange: 'MyExchange', type: 'crypto' });
    expect(m.description).toContain('Test Coin B');

    // A non-crypto type filter yields no results.
    const none = await request(app).get(`/api/v1/tradingview/search?query=${BASE}&type=stock`);
    expect(none.body).toEqual([]);
  });

  it('GET /symbols resolves a symbol with pricescale from tick size', async () => {
    const res = await request(app).get(`/api/v1/tradingview/symbols?symbol=${SYMBOL}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: SYMBOL, ticker: SYMBOL, type: 'crypto', session: '24x7', timezone: 'Etc/UTC',
      exchange: 'MyExchange', minmov: 1, pricescale: 100, has_intraday: true, has_daily: true,
      volume_precision: 8, data_status: 'streaming',
    });
    expect(res.body.supported_resolutions).toContain('240');
    expect(res.body.supported_resolutions).toContain('30');
    expect(res.body.description).toContain('Test Coin B');
    // Accepts an EXCHANGE: prefix.
    const prefixed = await request(app).get(`/api/v1/tradingview/symbols?symbol=MyExchange:${SYMBOL}`);
    expect(prefixed.status).toBe(200);
    expect(prefixed.body.name).toBe(SYMBOL);
  });

  it('GET /history returns OHLCV arrays for a window with trades', async () => {
    const fromSec = Math.floor(tradeAt.getTime() / 1000) - 120;
    const toSec = Math.floor(tradeAt.getTime() / 1000) + 120;
    const res = await request(app).get(`/api/v1/tradingview/history?symbol=${SYMBOL}&resolution=1&from=${fromSec}&to=${toSec}`);
    expect(res.status).toBe(200);
    expect(res.body.s).toBe('ok');
    expect(res.body.t.length).toBe(res.body.c.length);
    expect(res.body.t.length).toBeGreaterThanOrEqual(1);
    // The single trade @100 / qty 2 forms one bar.
    const i = res.body.c.length - 1;
    expect(res.body.o[i]).toBe(100);
    expect(res.body.h[i]).toBe(100);
    expect(res.body.l[i]).toBe(100);
    expect(res.body.c[i]).toBe(100);
    expect(res.body.v[i]).toBe(2);
    // Bar open time is bucket-aligned within the window.
    expect(res.body.t[i]).toBeGreaterThanOrEqual(fromSec);
  });

  it('GET /history returns no_data for an empty window or unknown symbol', async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 10 * 365 * 86400;
    const empty = await request(app).get(`/api/v1/tradingview/history?symbol=${SYMBOL}&resolution=1&from=${farFuture}&to=${farFuture + 60}`);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ s: 'no_data' });

    const unknown = await request(app).get(`/api/v1/tradingview/history?symbol=NOPE-USDT&resolution=1&from=0&to=99`);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ s: 'no_data' });
  });

  it('GET /symbols 404s an unknown symbol', async () => {
    const res = await request(app).get('/api/v1/tradingview/symbols?symbol=NOPE-USDT');
    expect(res.status).toBe(404);
  });
});
