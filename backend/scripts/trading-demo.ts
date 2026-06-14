/**
 * DEV-ONLY spot-trading demo verification.
 *
 * Proves the full USDT/INR trading flow over REAL HTTP against the running
 * public (:4000) and admin (:4001) servers, plus Postgres/Redis, with TWO users:
 *
 *   register A+B → verify email → login → submit KYC → admin approves both
 *   → fund A with INR (Razorpay mock + signed webhook)
 *   → fund B with USDT (INR deposit + INR→USDT conversion)
 *   → A LIMIT BUY rests → B LIMIT SELL crosses → engine fills the trade
 *   → assert A INR↓ / A USDT↑ / B USDT↓ / B INR↑ / fees credited
 *   → orders + trades visible, order book updates
 *   → cancel an open order (lock released)
 *   → MARKET BUY (budget) and MARKET SELL (quantity)
 *
 * It is a verification harness, NOT a feature. The only thing it touches the DB
 * for is local-demo prerequisites with no API: flipping `emailVerifiedAt` (login
 * is gated on it) and clearing any resting orders left on the market by a prior
 * run so the book starts empty. It never modifies the schema.
 *
 * Requires: `npm run dev` (:4000), `npm run dev:admin` (:4001), and a seeded DB
 * (`npm run db:seed` — provides the USDT-INR market + the local admin).
 *
 *   npx tsx scripts/trading-demo.ts
 */
import { createHmac, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { config } from '../src/config';
import { prisma } from '../src/lib/prisma';

const API = 'http://localhost:4000/api/v1';
const ADMIN = 'http://localhost:4001/admin/v1';
const SYMBOL = 'USDT-INR';

let stepNo = 0;
function step(name: string): void {
  stepNo += 1;
  // eslint-disable-next-line no-console
  console.log(`\n[${stepNo}] ${name}`);
}
function ok(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`    ✓ ${msg}`);
}
function fail(msg: string, body?: unknown): never {
  throw new Error(`${msg}${body ? ` :: ${JSON.stringify(body)}` : ''}`);
}
function assert(cond: boolean, msg: string): void {
  if (!cond) fail(`ASSERT FAILED: ${msg}`);
}

interface CallOpts {
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}
interface CallResult {
  status: number;
  body: {
    success?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  };
}
async function call(base: string, path: string, opts: CallOpts = {}): Promise<CallResult> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body:
        opts.body === undefined
          ? undefined
          : typeof opts.body === 'string'
            ? opts.body
            : JSON.stringify(opts.body),
    });
  } catch {
    return fail(
      `Network error calling ${path} — are the servers running? (npm run dev / dev:admin)`,
    );
  }
  const body = (await res.json().catch(() => null)) as CallResult['body'];
  return { status: res.status, body };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const d = (r: CallResult): any => r.body.data;
const idem = (): Record<string, string> => ({ 'Idempotency-Key': randomUUID() });
const D = (v: string | number): Prisma.Decimal => new Prisma.Decimal(v);

interface User {
  email: string;
  id: string;
  token: string;
}

/**
 * Read a balance field over HTTP via /wallets/overview. We use the overview
 * (not GET /wallets/:asset) because the per-asset endpoint 404s for an asset the
 * user has never held (e.g. A's USDT before its first trade); overview reports a
 * zero balance for such assets, matching the frontend's balance source.
 */
async function balanceField(
  token: string,
  asset: string,
  field: 'available' | 'locked',
): Promise<Prisma.Decimal> {
  const r = await call(API, '/wallets/overview', { token });
  if (r.status !== 200) fail(`wallet overview read ${r.status}`, r.body);
  const balances = d(r).balances as Array<{ asset: string; available: string; locked: string }>;
  const bal = balances.find((b) => b.asset.toUpperCase() === asset.toUpperCase());
  return D(bal?.[field] ?? '0');
}
async function avail(token: string, asset: string): Promise<Prisma.Decimal> {
  return balanceField(token, asset, 'available');
}
async function locked(token: string, asset: string): Promise<Prisma.Decimal> {
  return balanceField(token, asset, 'locked');
}

/** Register → verify email → login → submit KYC. Returns the user + token. */
async function registerAndLogin(label: string): Promise<User> {
  const email = `trade_${label}_${Date.now()}_${randomUUID().slice(0, 6)}@example.com`;
  const password = 'Str0ngPassw0rd!';

  const reg = await call(API, '/auth/register', { method: 'POST', body: { email, password } });
  if (reg.status !== 201) fail(`register ${label} status ${reg.status}`, reg.body);
  const id: string = d(reg).user.id;

  // Local-demo prerequisite: login is gated on a verified email.
  await prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });

  const login = await call(API, '/auth/login', { method: 'POST', body: { email, password } });
  if (login.status !== 200) fail(`login ${label} status ${login.status}`, login.body);
  const token: string = d(login).tokens.accessToken;

  // Distinct PAN per user (5 letters, 4 digits, 1 letter).
  const pan = `ABCDE${String(Math.floor(1000 + Math.random() * 9000))}F`;
  const kyc = await call(API, '/kyc', {
    method: 'POST',
    token,
    body: { fullName: `Trader ${label}`, dob: '1990-01-01', pan },
  });
  if (![200, 201, 202].includes(kyc.status)) fail(`kyc submit ${label} ${kyc.status}`, kyc.body);

  ok(`${label}: registered + logged in + KYC submitted (${email})`);
  return { email, id, token };
}

/** Fund a user with INR via the Razorpay mock order + signed payment webhook. */
async function depositInr(user: User, amount: string): Promise<void> {
  const dep = await call(API, '/inr/deposits', {
    method: 'POST',
    token: user.token,
    headers: idem(),
    body: { amount },
  });
  if (dep.status !== 201) fail(`INR deposit ${dep.status}`, dep.body);
  const orderId: string = d(dep).providerOrderId;

  const webhookBody = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_${randomUUID().slice(0, 12)}`,
          order_id: orderId,
          amount: Number(amount) * 100,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  };
  const raw = JSON.stringify(webhookBody);
  const sig = createHmac('sha256', config.razorpay.webhookSecret).update(raw).digest('hex');
  const hook = await call(API, '/inr/deposits/webhook', {
    method: 'POST',
    body: raw,
    headers: {
      'x-razorpay-signature': sig,
      'x-razorpay-event-id': `evt_${randomUUID().slice(0, 12)}`,
    },
  });
  if (hook.status !== 200) fail(`deposit webhook ${hook.status}`, hook.body);
}

/** Buy USDT with INR via a quote + conversion. Returns the USDT received. */
async function convertInrToUsdt(user: User, inrAmount: string): Promise<string> {
  const quote = await call(API, '/inr/quotes', {
    method: 'POST',
    token: user.token,
    body: { side: 'INR_TO_USDT', amount: inrAmount },
  });
  if (quote.status !== 200) fail(`quote ${quote.status}`, quote.body);
  const conv = await call(API, '/inr/conversions', {
    method: 'POST',
    token: user.token,
    headers: idem(),
    body: { quoteId: d(quote).id },
  });
  if (conv.status !== 201) fail(`conversion ${conv.status}`, conv.body);
  return d(conv).usdtAmount as string;
}

/** Place an order over HTTP with a fresh idempotency key. */
function place(token: string, body: Record<string, unknown>): Promise<CallResult> {
  return call(API, '/orders', { method: 'POST', token, headers: idem(), body });
}

async function orderBook(): Promise<{ bids: Array<{ price: string; quantity: string }>; asks: Array<{ price: string; quantity: string }> }> {
  const r = await call(API, `/markets/${SYMBOL}/orderbook?depth=20`);
  if (r.status !== 200) fail(`orderbook ${r.status}`, r.body);
  return d(r);
}

/**
 * DEV-ONLY: take any resting orders on the market out of the book so the demo
 * starts clean (trades are append-only and FK-reference their orders, so we
 * flip status rather than delete — exactly as the integration suite does).
 */
async function resetBook(): Promise<void> {
  const market = await prisma.market.findUnique({ where: { symbol: SYMBOL } });
  if (!market) fail(`market ${SYMBOL} not found — run \`npm run db:seed\``);
  if (market.status !== 'ACTIVE') fail(`market ${SYMBOL} is ${market.status}, expected ACTIVE`);
  await prisma.order.updateMany({
    where: { marketId: market.id, status: { in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] } },
    data: { status: 'CANCELLED', closedAt: new Date() },
  });
}

async function main(): Promise<void> {
  step('Reset order book (dev-only) + verify market is live');
  await resetBook();
  ok(`market ${SYMBOL} ACTIVE, book cleared`);

  // ---- 1. Create / login two users ----
  step('Create + login User A and User B');
  const A = await registerAndLogin('A');
  const B = await registerAndLogin('B');

  // ---- 2. Admin approves KYC for both ----
  step('Admin approves KYC for both users');
  const adminLogin = await call(ADMIN, '/auth/login', {
    method: 'POST',
    body: { email: 'admin@exchange.local', password: 'Admin@123456', totp: '000000' },
  });
  if (adminLogin.status !== 200) fail(`admin login ${adminLogin.status}`, adminLogin.body);
  const adminToken: string = d(adminLogin).tokens.accessToken;
  for (const u of [A, B]) {
    const decide = await call(ADMIN, `/kyc/${u.id}/decision`, {
      method: 'POST',
      token: adminToken,
      body: { decision: 'APPROVE', tier: 1 },
    });
    if (decide.status !== 200) fail(`kyc decision ${decide.status}`, decide.body);
  }
  // Re-login so the access tokens carry the approved KYC tier.
  for (const u of [A, B]) {
    const re = await call(API, '/auth/login', {
      method: 'POST',
      body: { email: u.email, password: 'Str0ngPassw0rd!' },
    });
    if (re.status !== 200) fail(`re-login ${re.status}`, re.body);
    u.token = d(re).tokens.accessToken;
  }
  ok('both users KYC APPROVED (tier 1)');

  // ---- 3. Fund User A with INR ----
  step('Fund User A with INR');
  await depositInr(A, '100000');
  const aInr0 = await avail(A.token, 'INR');
  assert(aInr0.gte('100000'), `A INR should be >= 100000, got ${aInr0.toFixed()}`);
  ok(`A INR available = ${aInr0.toFixed()}`);

  // ---- 4. Fund User B with USDT (deposit INR then convert) ----
  step('Fund User B with USDT (INR deposit → INR→USDT conversion)');
  await depositInr(B, '100000');
  const gotUsdt = await convertInrToUsdt(B, '50000');
  const bUsdt0 = await avail(B.token, 'USDT');
  assert(bUsdt0.gte('30'), `B USDT should be >= 30, got ${bUsdt0.toFixed()}`);
  ok(`B converted ₹50000 → ${gotUsdt} USDT; available = ${bUsdt0.toFixed()}`);

  // ====================================================================
  // CORE MATCHED TRADE: A rests a LIMIT BUY, B crosses with a LIMIT SELL.
  // ====================================================================
  const aInrBefore = await avail(A.token, 'INR');
  const aUsdtBefore = await avail(A.token, 'USDT');
  const bInrBefore = await avail(B.token, 'INR');
  const bUsdtBefore = await avail(B.token, 'USDT');

  // ---- 5. User A places a LIMIT BUY (rests, locks INR) ----
  step('User A places LIMIT BUY @90 × 10 (rests on the book)');
  const aBuy = await place(A.token, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '90.00', quantity: '10' });
  if (aBuy.status !== 201) fail(`A buy ${aBuy.status}`, aBuy.body);
  assert(d(aBuy).status === 'OPEN', `A buy should be OPEN, got ${d(aBuy).status}`);
  assert(
    (await avail(A.token, 'INR')).toFixed() === aInrBefore.sub('900').toFixed(),
    'A INR available should drop by 900 (locked)',
  );
  assert((await locked(A.token, 'INR')).gte('900'), 'A should have >= 900 INR locked');
  const book1 = await orderBook();
  assert(
    book1.bids.some((b) => b.price === '90' && b.quantity === '10'),
    'order book should show bid 90 x 10 after A rests',
  );
  ok('A buy OPEN, 900 INR locked, bid visible on the book');

  // ---- 6. User B places a LIMIT SELL that crosses ----
  step('User B places LIMIT SELL @90 × 10 (crosses A) → matching engine fills');
  const bSell = await place(B.token, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '90.00', quantity: '10' });
  if (bSell.status !== 201) fail(`B sell ${bSell.status}`, bSell.body);
  assert(d(bSell).status === 'FILLED', `B sell should be FILLED, got ${d(bSell).status}`);
  assert(Array.isArray(d(bSell).fills) && d(bSell).fills.length === 1, 'B sell should have 1 fill');
  ok(`trade executed: ${d(bSell).fills[0].quantity} USDT @ ${d(bSell).fills[0].price}`);

  // ---- 8. Verify balances + fees + visibility + book ----
  step('Verify settlement: balances, fees, orders/trades, order book');
  const aInrAfter = await avail(A.token, 'INR');
  const aUsdtAfter = await avail(A.token, 'USDT');
  const bInrAfter = await avail(B.token, 'INR');
  const bUsdtAfter = await avail(B.token, 'USDT');

  // A (maker BUY): pays 900 INR, receives 10 USDT - 0.01 maker fee = 9.99.
  assert(aInrAfter.toFixed() === aInrBefore.sub('900').toFixed(), `A INR should be -900 (got ${aInrAfter.sub(aInrBefore).toFixed()})`);
  assert(aUsdtAfter.toFixed() === aUsdtBefore.add('9.99').toFixed(), `A USDT should be +9.99 (got ${aUsdtAfter.sub(aUsdtBefore).toFixed()})`);
  // B (taker SELL): gives 10 USDT, receives 900 INR - 1.80 taker fee = 898.20.
  assert(bUsdtAfter.toFixed() === bUsdtBefore.sub('10').toFixed(), `B USDT should be -10 (got ${bUsdtAfter.sub(bUsdtBefore).toFixed()})`);
  assert(bInrAfter.toFixed() === bInrBefore.add('898.20').toFixed(), `B INR should be +898.20 (got ${bInrAfter.sub(bInrBefore).toFixed()})`);
  ok('A INR ↓900, A USDT ↑9.99, B USDT ↓10, B INR ↑898.20');

  // Fees credited — verified through each user's own trade record.
  const aTrades = await call(API, `/trades?symbol=${SYMBOL}`, { token: A.token });
  const bTrades = await call(API, `/trades?symbol=${SYMBOL}`, { token: B.token });
  if (aTrades.status !== 200 || bTrades.status !== 200) fail('trade history read failed');
  const aFee = d(aTrades).items[0];
  const bFee = d(bTrades).items[0];
  assert(aFee.role === 'MAKER' && D(aFee.fee).gt(0) && aFee.feeAsset === 'USDT', `A maker fee in USDT > 0 (got ${aFee.fee} ${aFee.feeAsset})`);
  assert(bFee.role === 'TAKER' && D(bFee.fee).gt(0) && bFee.feeAsset === 'INR', `B taker fee in INR > 0 (got ${bFee.fee} ${bFee.feeAsset})`);
  ok(`fees credited: maker ${aFee.fee} USDT, taker ${bFee.fee} INR`);

  // Orders + trades visible.
  const aHistory = await call(API, `/orders?symbol=${SYMBOL}`, { token: A.token });
  const bOpen = await call(API, '/orders/open', { token: B.token });
  assert(d(aHistory).items.some((o: { id: string }) => o.id === d(aBuy).id), 'A buy should appear in order history');
  assert(Array.isArray(d(bOpen).items), 'B open-orders list should be returned');
  ok('orders + trades visible via API');

  // Order book updated — the crossed bid is gone.
  const book2 = await orderBook();
  assert(!book2.bids.some((b) => b.price === '90'), 'bid 90 should be gone after the fill');
  ok('order book updated (crossed level removed)');

  // ---- 9. Cancel an open order ----
  step('Cancel an open order (lock released)');
  const aInrPreRest = await avail(A.token, 'INR');
  const rest = await place(A.token, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '50.00', quantity: '2' });
  if (rest.status !== 201) fail(`rest order ${rest.status}`, rest.body);
  assert(d(rest).status === 'OPEN', 'resting buy should be OPEN');
  assert((await avail(A.token, 'INR')).toFixed() === aInrPreRest.sub('100').toFixed(), 'A INR should drop by 100 (locked)');
  const openBefore = await call(API, '/orders/open', { token: A.token });
  assert(d(openBefore).items.some((o: { id: string }) => o.id === d(rest).id), 'resting order should be in open orders');

  const cancel = await call(API, `/orders/${d(rest).id}`, { method: 'DELETE', token: A.token });
  if (cancel.status !== 200) fail(`cancel ${cancel.status}`, cancel.body);
  assert(d(cancel).status === 'CANCELLED', `order should be CANCELLED, got ${d(cancel).status}`);
  assert((await avail(A.token, 'INR')).toFixed() === aInrPreRest.toFixed(), 'A INR lock should be fully released after cancel');
  const openAfter = await call(API, '/orders/open', { token: A.token });
  assert(!d(openAfter).items.some((o: { id: string }) => o.id === d(rest).id), 'cancelled order should leave open orders');
  ok('order cancelled, 100 INR lock released, gone from open orders');

  // ---- 10a. MARKET BUY against a resting ask (budget-driven) ----
  step('User A MARKET BUY with budget 460 (against B resting SELL @92 × 5)');
  // Snapshot BEFORE B rests: placing the SELL moves B's 5 USDT available→locked,
  // and the fill settles out of locked — so available is measured against the
  // pre-rest baseline to capture the full −5 effect.
  const aInrPre = await avail(A.token, 'INR');
  const aUsdtPre = await avail(A.token, 'USDT');
  const bInrPre = await avail(B.token, 'INR');
  const bUsdtPre = await avail(B.token, 'USDT');
  const bSellRest = await place(B.token, { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', price: '92.00', quantity: '5' });
  if (bSellRest.status !== 201) fail(`B rest sell ${bSellRest.status}`, bSellRest.body);
  const mBuy = await place(A.token, { symbol: SYMBOL, side: 'BUY', type: 'MARKET', quoteBudget: '460.00' });
  if (mBuy.status !== 201) fail(`market buy ${mBuy.status}`, mBuy.body);
  assert(d(mBuy).status === 'FILLED', `market buy should be FILLED, got ${d(mBuy).status}`);
  // A pays 460 INR, gets 5 - 0.01 taker fee = 4.99 USDT. B gives 5 USDT, gets 460 - 0.46 maker fee = 459.54 INR.
  assert((await avail(A.token, 'INR')).toFixed() === aInrPre.sub('460').toFixed(), 'A INR should be -460 on market buy');
  assert((await avail(A.token, 'USDT')).toFixed() === aUsdtPre.add('4.99').toFixed(), 'A USDT should be +4.99 on market buy');
  assert((await avail(B.token, 'USDT')).toFixed() === bUsdtPre.sub('5').toFixed(), 'B USDT should be -5 on market buy');
  assert((await avail(B.token, 'INR')).toFixed() === bInrPre.add('459.54').toFixed(), 'B INR should be +459.54 on market buy');
  ok('MARKET BUY filled: A ↑4.99 USDT / ↓460 INR, B ↓5 USDT / ↑459.54 INR');

  // ---- 10b. MARKET SELL against a resting bid (quantity-driven) ----
  step('User B MARKET SELL quantity 3 (against A resting BUY @88 × 3)');
  // Snapshot BEFORE A rests: placing the BUY locks 264 INR (available→locked),
  // and the fill settles out of locked — measure against the pre-rest baseline.
  const aInrPre2 = await avail(A.token, 'INR');
  const aUsdtPre2 = await avail(A.token, 'USDT');
  const bInrPre2 = await avail(B.token, 'INR');
  const bUsdtPre2 = await avail(B.token, 'USDT');
  const aBuyRest = await place(A.token, { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', price: '88.00', quantity: '3' });
  if (aBuyRest.status !== 201) fail(`A rest buy ${aBuyRest.status}`, aBuyRest.body);
  const mSell = await place(B.token, { symbol: SYMBOL, side: 'SELL', type: 'MARKET', quantity: '3' });
  if (mSell.status !== 201) fail(`market sell ${mSell.status}`, mSell.body);
  assert(d(mSell).status === 'FILLED', `market sell should be FILLED, got ${d(mSell).status}`);
  // B gives 3 USDT, gets 264 - 0.52 taker fee = 263.48 INR. A pays 264 INR, gets 3 - 0.003 maker fee = 2.997 USDT.
  assert((await avail(B.token, 'USDT')).toFixed() === bUsdtPre2.sub('3').toFixed(), 'B USDT should be -3 on market sell');
  assert((await avail(B.token, 'INR')).toFixed() === bInrPre2.add('263.48').toFixed(), 'B INR should be +263.48 on market sell');
  assert((await avail(A.token, 'INR')).toFixed() === aInrPre2.sub('264').toFixed(), 'A INR should be -264 on market sell');
  assert((await avail(A.token, 'USDT')).toFixed() === aUsdtPre2.add('2.997').toFixed(), 'A USDT should be +2.997 on market sell');
  ok('MARKET SELL filled: B ↓3 USDT / ↑263.48 INR, A ↑2.997 USDT / ↓264 INR');

  // eslint-disable-next-line no-console
  console.log('\n✅ TRADING DEMO VERIFICATION PASSED');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('\n❌ TRADING DEMO FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Best-effort: take this run's resting orders out of the book.
    try {
      const market = await prisma.market.findUnique({ where: { symbol: SYMBOL } });
      if (market) {
        await prisma.order.updateMany({
          where: { marketId: market.id, status: { in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] } },
          data: { status: 'CANCELLED', closedAt: new Date() },
        });
      }
    } catch {
      /* ignore cleanup errors */
    }
    await prisma.$disconnect().catch(() => undefined);
  });
