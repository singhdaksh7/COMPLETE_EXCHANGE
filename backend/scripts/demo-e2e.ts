/**
 * DEV-ONLY end-to-end demo verification.
 *
 * Drives the full MVP flow over REAL HTTP against the running public (:4000) and
 * admin (:4001) servers, plus Postgres — register → KYC → INR deposit (Razorpay
 * mock + signed webhook) → TRC20 address → INR↔USDT conversion → USDT withdrawal
 * → broadcast/confirm worker → completion.
 *
 * It is a verification harness, NOT a feature. The only thing it seeds directly
 * is one operational prerequisite that has no API yet (an active TRON hot wallet
 * + signer + nonce) and the email-verified flag for local login. It never
 * modifies the schema.
 *
 * Requires: `npm run dev` (:4000) and `npm run dev:admin` (:4001) running.
 *
 *   npx tsx scripts/demo-e2e.ts
 */
import { createHmac, randomUUID } from 'node:crypto';
import { config } from '../src/config';
import { prisma } from '../src/lib/prisma';
import {
  runBroadcastCycle,
  runConfirmationCycle,
} from '../src/modules/withdrawal/withdrawal.worker';
import { createMockWithdrawalSigner } from '../src/modules/withdrawal/providers/withdrawal-signer.mock';

const API = 'http://localhost:4000/api/v1';
const ADMIN = 'http://localhost:4001/admin/v1';

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

interface CallOpts {
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}
interface CallResult {
  status: number;
  body: { success?: boolean; data?: unknown; error?: { code?: string; message?: string } };
}
async function call(base: string, path: string, opts: CallOpts = {}): Promise<CallResult> {
  const res = await fetch(`${base}${path}`, {
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
  const body = (await res.json().catch(() => null)) as CallResult['body'];
  return { status: res.status, body };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const d = (r: CallResult): any => r.body.data;

const idem = (): Record<string, string> => ({ 'Idempotency-Key': randomUUID() });
const TRON_ADDR = `T${'A'.repeat(33)}`;

async function main(): Promise<void> {
  // --- operational prerequisite: an active TRON hot wallet (no API for this) ---
  const hotExists = await prisma.hotWallet.findFirst({
    where: { chain: 'TRON', isActive: true, tier: 'HOT' },
  });
  if (!hotExists) {
    const signer = await prisma.chainSigner.create({
      data: {
        chain: 'TRON',
        name: 'demo-tron-signer',
        kmsKeyRef: `kms://demo/tron/${Date.now()}`,
        publicKey: '0xdemo',
        status: 'ACTIVE',
      },
    });
    const hw = await prisma.hotWallet.create({
      data: {
        chain: 'TRON',
        signerId: signer.id,
        address: `TDemoHot${Date.now().toString().slice(-10)}`,
        tier: 'HOT',
        label: 'demo hot wallet',
        isActive: true,
      },
    });
    await prisma.walletNonce.create({ data: { hotWalletId: hw.id, nextNonce: 0 } });
    ok('seeded demo TRON hot wallet + signer + nonce');
  } else {
    ok('active TRON hot wallet already present');
  }

  const reqConf =
    (
      await prisma.assetChain.findUnique({
        where: { asset_chain: { asset: 'USDT', chain: 'TRON' } },
      })
    )?.minConfirmations ?? 20;

  const email = `demo_${Date.now()}@example.com`;
  const password = 'Str0ngPassw0rd!';

  // ---- 1. Register ----
  step('Register user');
  const reg = await call(API, '/auth/register', { method: 'POST', body: { email, password } });
  if (reg.status !== 201) fail(`register status ${reg.status}`, reg.body);
  const userId: string = d(reg).user.id;
  ok(`registered ${email}`);

  // Local-demo: mark email verified (login is gated on it).
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });

  // ---- 2. Login ----
  step('Login');
  const login = await call(API, '/auth/login', { method: 'POST', body: { email, password } });
  if (login.status !== 200) fail(`login status ${login.status}`, login.body);
  const token: string = d(login).tokens.accessToken;
  ok('logged in');

  // ---- 3. Submit KYC ----
  step('Submit KYC');
  const kyc = await call(API, '/kyc', {
    method: 'POST',
    token,
    body: { fullName: 'Demo User', dob: '1990-01-01', pan: 'ABCDE1234F' },
  });
  if (![200, 201, 202].includes(kyc.status)) fail(`kyc status ${kyc.status}`, kyc.body);
  ok(`KYC submitted → ${d(kyc).status}`);

  // ---- Admin login ----
  step('Admin login');
  const adminLogin = await call(ADMIN, '/auth/login', {
    method: 'POST',
    body: { email: 'admin@exchange.local', password: 'Admin@123456', totp: '000000' },
  });
  if (adminLogin.status !== 200) fail(`admin login ${adminLogin.status}`, adminLogin.body);
  const adminToken: string = d(adminLogin).tokens.accessToken;
  ok('admin logged in');

  // ---- 4. Admin approves KYC ----
  step('Admin approves KYC');
  const decide = await call(ADMIN, `/kyc/${userId}/decision`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'APPROVE', tier: 1 },
  });
  if (decide.status !== 200) fail(`kyc decision ${decide.status}`, decide.body);
  ok(`KYC → ${d(decide).status} (tier ${d(decide).tier})`);

  // ---- 5. Create INR deposit (Razorpay mock order) ----
  step('Create INR deposit mock order');
  const dep = await call(API, '/inr/deposits', {
    method: 'POST',
    token,
    headers: idem(),
    body: { amount: '5000' },
  });
  if (dep.status !== 201) fail(`deposit status ${dep.status}`, dep.body);
  const orderId: string = d(dep).providerOrderId;
  ok(`order ${orderId} status ${d(dep).status}`);

  // ---- 6. Trigger the deposit webhook (HMAC-signed payment.captured) ----
  step('Trigger deposit webhook (payment.captured)');
  const webhookBody = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_${randomUUID().slice(0, 12)}`,
          order_id: orderId,
          amount: 5000 * 100,
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
    headers: { 'x-razorpay-signature': sig, 'x-razorpay-event-id': `evt_${randomUUID().slice(0, 12)}` },
  });
  if (hook.status !== 200) fail(`webhook status ${hook.status}`, hook.body);
  ok(`webhook accepted (duplicate=${d(hook).duplicate})`);

  // ---- 7. Confirm INR balance ----
  step('Confirm INR balance updated');
  const inrWallet = await call(API, '/wallets/INR', { token });
  if (inrWallet.status !== 200) fail(`wallet ${inrWallet.status}`, inrWallet.body);
  if (d(inrWallet).available !== '5000') fail(`INR expected 5000, got ${d(inrWallet).available}`);
  ok(`INR available = ${d(inrWallet).available}`);

  // ---- 8. Generate TRC20 deposit address ----
  step('Generate TRC20 (TRON) deposit address');
  const addr = await call(API, '/wallets/addresses', {
    method: 'POST',
    token,
    headers: idem(),
    body: { chain: 'TRON' },
  });
  if (![200, 201].includes(addr.status)) fail(`address ${addr.status}`, addr.body);
  ok(`deposit address ${d(addr).address}`);

  // ---- 9. Create INR→USDT quote ----
  step('Create INR→USDT quote');
  const quote = await call(API, '/inr/quotes', {
    method: 'POST',
    token,
    body: { side: 'INR_TO_USDT', amount: '4000' },
  });
  if (quote.status !== 200) fail(`quote ${quote.status}`, quote.body);
  const quoteId: string = d(quote).id;
  ok(`quote ${quoteId}: rate ${d(quote).rate}, receive ${d(quote).usdtAmount} USDT`);

  // ---- 10. Execute conversion ----
  step('Execute conversion');
  const conv = await call(API, '/inr/conversions', {
    method: 'POST',
    token,
    headers: idem(),
    body: { quoteId },
  });
  if (conv.status !== 201) fail(`conversion ${conv.status}`, conv.body);
  const gotUsdt: string = d(conv).usdtAmount;
  ok(`converted → ${gotUsdt} USDT (₹${d(conv).inrAmount} spent)`);

  // ---- 11. Confirm USDT balance ----
  step('Confirm USDT balance updated');
  const usdtWallet = await call(API, '/wallets/USDT', { token });
  if (usdtWallet.status !== 200) fail(`wallet ${usdtWallet.status}`, usdtWallet.body);
  if (d(usdtWallet).available !== gotUsdt) {
    fail(`USDT expected ${gotUsdt}, got ${d(usdtWallet).available}`);
  }
  ok(`USDT available = ${d(usdtWallet).available}`);

  // ---- 12. Add withdrawal address ----
  step('Add withdrawal address (allowlist)');
  const wdAddr = await call(API, '/withdrawals/addresses', {
    method: 'POST',
    token,
    body: { chain: 'TRON', address: TRON_ADDR, label: 'demo' },
  });
  if (wdAddr.status !== 201) fail(`add address ${wdAddr.status}`, wdAddr.body);
  ok(`allowlisted ${d(wdAddr).address} (usable=${d(wdAddr).usable})`);

  // ---- 13. Request USDT withdrawal ----
  step('Request USDT withdrawal');
  const wd = await call(API, '/withdrawals', {
    method: 'POST',
    token,
    headers: idem(),
    body: { toAddress: TRON_ADDR, amount: '10' },
  });
  if (wd.status !== 201) fail(`withdrawal ${wd.status}`, wd.body);
  const wdId: string = d(wd).id;
  ok(`withdrawal ${wdId} → ${d(wd).status} (net ${d(wd).netAmount})`);

  // ---- 14. Admin approves withdrawal ----
  step('Admin approves withdrawal');
  const approve = await call(ADMIN, `/withdrawals/${wdId}/approve`, {
    method: 'POST',
    token: adminToken,
  });
  if (approve.status !== 200) fail(`approve ${approve.status}`, approve.body);
  ok(`withdrawal → ${d(approve).status}`);

  // ---- 15. Run broadcast + confirmation worker ----
  step('Run withdrawal broadcast + confirmation worker');
  const signer = createMockWithdrawalSigner();
  const broadcast = await runBroadcastCycle(signer);
  ok(`broadcast cycle: ${broadcast} withdrawal(s) broadcast`);
  const afterBroadcast = await prisma.cryptoWithdrawal.findUniqueOrThrow({ where: { id: wdId } });
  if (afterBroadcast.status !== 'BROADCAST' || !afterBroadcast.txHash) {
    fail(`expected BROADCAST with txHash, got ${afterBroadcast.status}`);
  }
  ok(`status ${afterBroadcast.status}, txHash ${afterBroadcast.txHash}, nonce ${afterBroadcast.nonce}`);
  signer.confirm(afterBroadcast.txHash, reqConf);
  const confirm = await runConfirmationCycle(signer);
  ok(`confirmation cycle: completed=${confirm.completed} failed=${confirm.failed}`);

  // ---- 16. Confirm withdrawal status ----
  step('Confirm withdrawal status updated');
  const wdFinal = await call(API, `/withdrawals/${wdId}`, { token });
  if (wdFinal.status !== 200) fail(`withdrawal get ${wdFinal.status}`, wdFinal.body);
  if (d(wdFinal).status !== 'COMPLETED') fail(`expected COMPLETED, got ${d(wdFinal).status}`, d(wdFinal));
  ok(`withdrawal → ${d(wdFinal).status}`);

  // eslint-disable-next-line no-console
  console.log('\n✅ END-TO-END DEMO VERIFICATION PASSED');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('\n❌ DEMO FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Deactivate the demo-seeded hot wallet so it cannot be picked by the
    // integration test suite (pickActiveHotWallet chooses the oldest ACTIVE
    // wallet). The row is kept (a completed demo withdrawal references it).
    await prisma.hotWallet
      .updateMany({ where: { label: 'demo hot wallet' }, data: { isActive: false } })
      .catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });
