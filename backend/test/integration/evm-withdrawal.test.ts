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
import { runBroadcastCycle, runConfirmationCycle } from '../../src/modules/withdrawal/withdrawal.worker';

/**
 * EVM crypto withdrawals (Phase 5.2) — full lifecycle for ERC20 (Ethereum) and
 * BEP20 (BSC) USDT through the EXISTING withdrawal flow + mock signer:
 * request → hold → approve → mock broadcast → confirm → complete. Also proves a
 * duplicate broadcast never double-debits and that nonce sequencing is chain
 * scoped. TRON is exercised by withdrawal.test.ts (unchanged).
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

async function fund(userId: string, amount: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await ledgerService.post(
        {
          kind: 'TEST_FUNDING',
          referenceType: 'test_funding',
          referenceId: randomUUID(),
          lines: [
            { kind: 'SWEEP_CLEARING', userId: null, asset: 'USDT', direction: 'DEBIT', amount },
            { kind: 'USER_AVAILABLE', userId, asset: 'USDT', direction: 'CREDIT', amount },
          ],
        },
        { userId },
      );
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

async function usdt(userId: string): Promise<{ available: string; locked: string }> {
  const w = await ledgerService.getWallet(userId, 'USDT');
  return { available: w.available, locked: w.locked };
}

interface ChainCase {
  chain: string;
  native: string;
  contract: string;
  decimals: number;
  reqConf: number;
  fee: string;
}

const CASES: ChainCase[] = [
  { chain: 'ETHEREUM', native: 'ETH', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, reqConf: 12, fee: '8' },
  { chain: 'BSC', native: 'BNB', contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, reqConf: 15, fee: '2' },
];

d('EVM crypto withdrawals (integration)', () => {
  const app = buildApp();
  const signer = createMockWithdrawalSigner();
  const suffix = randomUUID().slice(0, 8);

  const users: Record<string, { id: string; token: string; to: string; hot: string; hotId: string; signerId: string }> = {};
  let adminId = '';
  let adminToken = '';
  let roleId = '';

  function pad40(seed: string): string {
    return `0x${(seed + '0'.repeat(40)).slice(0, 40)}`;
  }

  beforeAll(async () => {
    for (const [symbol, name, dec] of [
      ['USDT', 'Tether USD', 6],
      ['ETH', 'Ethereum', 18],
      ['BNB', 'BNB', 18],
    ] as Array<[string, string, number]>) {
      await prisma.asset.upsert({ where: { symbol }, update: {}, create: { symbol, name, kind: 'CRYPTO', decimals: dec } });
    }

    // Make this test the only source of active EVM hot wallets (deterministic pick).
    await prisma.hotWallet.updateMany({ where: { chain: { in: ['ETHEREUM', 'BSC'] }, isActive: true }, data: { isActive: false } });

    for (const c of CASES) {
      await prisma.chain.upsert({ where: { id: c.chain }, update: {}, create: { id: c.chain, name: c.chain, family: 'EVM', nativeAsset: c.native } });
      await prisma.assetChain.upsert({
        where: { asset_chain: { asset: 'USDT', chain: c.chain } },
        update: { isActive: true, contractAddr: c.contract, decimals: c.decimals, minConfirmations: c.reqConf },
        create: { asset: 'USDT', chain: c.chain, contractAddr: c.contract, decimals: c.decimals, minConfirmations: c.reqConf },
      });

      const user = await prisma.user.create({ data: { email: `evmw_${c.chain}_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1 } });
      const sid = randomUUID();
      await prisma.authSession.create({ data: { id: sid, userId: user.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
      const token = signAccessToken({ sub: user.id, sid, kycTier: 1 });
      await fund(user.id, '100');

      // Hex-only seeds so the generated 0x addresses pass EVM validation.
      const tag = c.chain === 'ETHEREUM' ? 'aa' : 'bb';
      const to = pad40(`${suffix}${tag}de57`);
      await prisma.withdrawalAddress.create({ data: { userId: user.id, chain: c.chain, address: to, whitelistedAt: new Date(Date.now() - 1000) } });

      const sg = await prisma.chainSigner.create({ data: { chain: c.chain, name: `signer_${c.chain}_${suffix}`, kmsKeyRef: `kms://${c.chain}/${suffix}`, publicKey: '0xpub', status: 'ACTIVE' } });
      const hotAddr = pad40(`${suffix}${tag}c0de`);
      const hw = await prisma.hotWallet.create({ data: { chain: c.chain, signerId: sg.id, address: hotAddr, tier: 'HOT', label: 'evm-wd', isActive: true } });
      await prisma.walletNonce.create({ data: { hotWalletId: hw.id, nextNonce: 0 } });

      users[c.chain] = { id: user.id, token, to, hot: hotAddr, hotId: hw.id, signerId: sg.id };
    }

    const perms = await Promise.all(['withdrawal.view', 'withdrawal.approve', 'withdrawal.reject'].map((code) =>
      prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } })));
    const role = await prisma.role.create({ data: { name: `EVMWD_${suffix}`, scope: 'ADMIN', description: 'evm wd test' } });
    roleId = role.id;
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
    const admin = await prisma.admin.create({ data: { email: `evmadmin_${suffix}@example.com`, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    adminId = admin.id;
    await prisma.adminRole.create({ data: { adminId, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId, refreshHash: `ar_${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    adminToken = signAdminAccessToken({ sub: adminId, sid: asid });
  });

  afterAll(async () => {
    try {
      const ids = Object.values(users).map((u) => u.id);
      const hotIds = Object.values(users).map((u) => u.hotId);
      const signerIds = Object.values(users).map((u) => u.signerId);
      await prisma.cryptoWithdrawal.deleteMany({ where: { userId: { in: ids } } });
      await prisma.withdrawalAddress.deleteMany({ where: { userId: { in: ids } } });
      await prisma.walletNonce.deleteMany({ where: { hotWalletId: { in: hotIds } } });
      await prisma.hotWallet.deleteMany({ where: { id: { in: hotIds } } });
      await prisma.chainSigner.deleteMany({ where: { id: { in: signerIds } } });
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: ids } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
      await prisma.adminRole.deleteMany({ where: { adminId } });
      await prisma.adminSession.deleteMany({ where: { adminId } });
      if (roleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        await prisma.role.deleteMany({ where: { id: roleId } });
      }
    } catch {
      /* best-effort */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('rejects a malformed EVM address at request time', async () => {
    const u = users.ETHEREUM;
    const res = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${u.token}`)
      .set('Idempotency-Key', `bad-${suffix}`)
      .send({ chain: 'ETHEREUM', toAddress: '0xnotanaddress', amount: '20' });
    expect(res.status).toBe(422);
  });

  for (const c of CASES) {
    it(`${c.chain}: request → hold → approve → broadcast → confirm → complete`, async () => {
      const u = users[c.chain];
      const gross = '20';
      const net = (20 - Number(c.fee)).toString();

      // Request → hold.
      const req = await request(app)
        .post('/api/v1/withdrawals')
        .set('Authorization', `Bearer ${u.token}`)
        .set('Idempotency-Key', `evmwd-${c.chain}-${suffix}`)
        .send({ chain: c.chain, toAddress: u.to, amount: gross });
      expect(req.status).toBe(201);
      expect(req.body.data.status).toBe('PENDING_APPROVAL');
      expect(req.body.data.chain).toBe(c.chain);
      expect(req.body.data.fee).toBe(c.fee);
      expect(req.body.data.netAmount).toBe(net);
      const id = req.body.data.id;

      let bal = await usdt(u.id);
      expect(bal.available).toBe('80');
      expect(bal.locked).toBe('20');

      // Approve.
      const approve = await request(app).post(`/admin/withdrawals/${id}/approve`).set('Authorization', `Bearer ${adminToken}`);
      expect(approve.status).toBe(200);
      expect(approve.body.data.status).toBe('APPROVED');

      // Broadcast (chain-scoped). The EVM mock tx hash is 0x-shaped.
      const broadcast = await runBroadcastCycle(signer, c.chain);
      expect(broadcast).toBe(1);
      const w1 = await prisma.cryptoWithdrawal.findUniqueOrThrow({ where: { id } });
      expect(w1.status).toBe('BROADCAST');
      expect(w1.txHash?.startsWith('0x')).toBe(true);
      expect(w1.nonce).toBe(0n);
      expect(w1.fromAddress).toBe(u.hot);

      // Duplicate broadcast → no re-broadcast, no nonce advance, no double debit.
      const dup = await runBroadcastCycle(signer, c.chain);
      expect(dup).toBe(0);
      const nonceRow = await prisma.walletNonce.findUniqueOrThrow({ where: { hotWalletId: u.hotId } });
      expect(nonceRow.nextNonce).toBe(1n);
      bal = await usdt(u.id);
      expect(bal.locked).toBe('20'); // still held, not double-moved

      // Confirm to required depth → finalize.
      signer.confirm(w1.txHash as string, c.reqConf);
      const conf = await runConfirmationCycle(signer, c.chain);
      expect(conf.completed).toBe(1);

      const w2 = await prisma.cryptoWithdrawal.findUniqueOrThrow({ where: { id } });
      expect(w2.status).toBe('COMPLETED');
      bal = await usdt(u.id);
      expect(bal.available).toBe('80'); // gross 20 left the locked balance
      expect(bal.locked).toBe('0');

      // Re-running the cycle does not move money again (idempotent).
      await runConfirmationCycle(signer, c.chain);
      const balAfter = await usdt(u.id);
      expect(balAfter).toEqual(bal);
    });
  }

  it('nonce sequencing is chain-scoped (independent per hot wallet)', async () => {
    const eth = await prisma.walletNonce.findUniqueOrThrow({ where: { hotWalletId: users.ETHEREUM.hotId } });
    const bsc = await prisma.walletNonce.findUniqueOrThrow({ where: { hotWalletId: users.BSC.hotId } });
    // Each chain used exactly one nonce (0) → next is 1 on both, independently.
    expect(eth.nextNonce).toBe(1n);
    expect(bsc.nextNonce).toBe(1n);
  });

  it('admin can filter the withdrawal queue by chain', async () => {
    const res = await request(app)
      .get('/admin/withdrawals?chain=ETHEREUM&status=COMPLETED')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((w: { chain: string }) => w.chain === 'ETHEREUM')).toBe(true);
    expect(res.body.data.items.some((w: { id: string }) => w.id)).toBe(true);
  });
});
