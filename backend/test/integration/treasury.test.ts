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
 * Treasury / Hot-Cold Wallet Foundation (Module 2).
 *
 * Proves: hot/cold wallet listings (key-free), the health summary, the
 * sweep (hot→cold) and refill (cold→hot) request + approval flows settling
 * through the ledger HOT_WALLET/COLD_WALLET system accounts, separation of
 * duties (a requester cannot approve their own transfer), reject, RBAC
 * (withdrawal.view to read; withdrawal.approve/treasury.manage to move), and
 * that no private-key material is ever returned.
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

d('Treasury hot/cold custody (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  // Fully isolated chain + asset per run so this suite never collides with the
  // TRON-based withdrawal/scanner tests (which pick the oldest active TRON hot
  // wallet) nor shares custody (HOT_WALLET/COLD_WALLET) balances with them.
  const CHAIN = `TRES${suffix}`.toUpperCase();
  const ASSET = `TUSD${suffix}`.toUpperCase();
  const hotAddr = `THotWallet_${suffix}`;
  const coldAddr = `TColdWallet_${suffix}`;
  let signerId = '';

  let hotWalletId = '';
  let coldWalletId = '';
  let userId = '';
  let userToken = '';
  let adminAId = '';
  let adminBId = '';
  let viewerId = '';
  let adminAToken = '';
  let adminBToken = '';
  let viewerToken = '';
  const roleIds: string[] = [];

  async function custody(kind: 'HOT_WALLET' | 'COLD_WALLET', asset: string): Promise<Prisma.Decimal> {
    const a = await prisma.account.findFirst({
      where: { kind: kind as never, userId: null, asset },
      include: { balance: true },
    });
    return D(a?.balance?.balance?.toFixed() ?? '0');
  }

  async function mkAdmin(perms: string[]): Promise<{ id: string; token: string }> {
    const role = await prisma.role.create({ data: { name: `TRES_${randomUUID().slice(0, 8)}`, scope: 'ADMIN', description: 'treasury test' } });
    roleIds.push(role.id);
    for (const code of perms) {
      const perm = await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
    const admin = await prisma.admin.create({ data: { email: `tres_${randomUUID().slice(0, 8)}@example.com`, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    await prisma.adminRole.create({ data: { adminId: admin.id, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId: admin.id, refreshHash: `ar_${randomUUID()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    return { id: admin.id, token: signAdminAccessToken({ sub: admin.id, sid: asid }) };
  }

  function move(token: string, path: string, body: Record<string, unknown>) {
    return request(app).post(`/admin/treasury${path}`).set('Authorization', `Bearer ${token}`).send(body);
  }

  beforeAll(async () => {
    // Reference data (self-contained, fully isolated — does not rely on seed).
    for (const [symbol, name, decimals] of [
      [ASSET, 'Test USD', 6],
      ['TRX', 'TRON', 6],
    ] as Array<[string, string, number]>) {
      await prisma.asset.upsert({ where: { symbol }, update: {}, create: { symbol, name, decimals, kind: 'CRYPTO' } });
    }
    await prisma.chain.upsert({
      where: { id: CHAIN },
      update: {},
      create: { id: CHAIN, name: `Test ${suffix}`, family: 'TRON', nativeAsset: 'TRX', confirmations: 20, reorgBuffer: 32 },
    });
    await prisma.assetChain.upsert({
      where: { asset_chain: { asset: ASSET, chain: CHAIN } },
      update: { isActive: true },
      create: { asset: ASSET, chain: CHAIN, contractAddr: 'TMockContract', decimals: 6, minConfirmations: 20, isActive: true },
    });

    const signer = await prisma.chainSigner.create({
      data: { chain: CHAIN, name: `Signer ${suffix}`, kmsKeyRef: `kms://mock/${CHAIN}/${suffix}`, publicKey: null, status: 'ACTIVE' },
    });
    signerId = signer.id;
    const hot = await prisma.hotWallet.create({ data: { chain: CHAIN, signerId: signer.id, address: hotAddr, tier: 'HOT', label: 'test hot', isActive: true } });
    const cold = await prisma.hotWallet.create({ data: { chain: CHAIN, signerId: signer.id, address: coldAddr, tier: 'COLD', label: 'test cold', isActive: true } });
    hotWalletId = hot.id;
    coldWalletId = cold.id;

    // Fund the HOT_WALLET custody position (simulates an on-chain balance).
    await postLedger('TEST_CUSTODY_FUNDING', [
      { kind: 'SYSTEM', userId: null, asset: ASSET, direction: 'DEBIT', amount: '1000' },
      { kind: 'HOT_WALLET', userId: null, asset: ASSET, direction: 'CREDIT', amount: '1000' },
    ]);

    const u = await prisma.user.create({ data: { email: `tresU_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1 } });
    userId = u.id;
    const usid = randomUUID();
    await prisma.authSession.create({ data: { id: usid, userId: u.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    userToken = signAccessToken({ sub: u.id, sid: usid, kycTier: 1 });

    const a = await mkAdmin(['withdrawal.view', 'treasury.manage']);
    const b = await mkAdmin(['withdrawal.view', 'treasury.manage']);
    const v = await mkAdmin(['withdrawal.view']);
    adminAId = a.id; adminAToken = a.token;
    adminBId = b.id; adminBToken = b.token;
    viewerId = v.id; viewerToken = v.token;
  });

  afterAll(async () => {
    try {
      await prisma.treasuryTransfer.deleteMany({ where: { OR: [{ fromWalletId: hotWalletId }, { fromWalletId: coldWalletId }] } });
      await prisma.hotWallet.deleteMany({ where: { id: { in: [hotWalletId, coldWalletId] } } });
      if (signerId) await prisma.chainSigner.deleteMany({ where: { id: signerId } });
      await prisma.authSession.deleteMany({ where: { userId } });
      for (const aid of [adminAId, adminBId, viewerId]) {
        await prisma.adminRole.deleteMany({ where: { adminId: aid } });
        await prisma.adminSession.deleteMany({ where: { adminId: aid } });
      }
      for (const rid of roleIds) {
        await prisma.rolePermission.deleteMany({ where: { roleId: rid } });
        await prisma.role.deleteMany({ where: { id: rid } });
      }
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('rejects a non-admin user token', async () => {
    const res = await request(app).get('/admin/treasury/hot-wallets').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(401);
  });

  it('lists hot wallets (key-free) and excludes cold wallets', async () => {
    const res = await request(app).get(`/admin/treasury/hot-wallets?chain=${CHAIN}`).set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((w: { id: string }) => w.id === hotWalletId);
    expect(item).toBeTruthy();
    expect(item.tier).toBe('HOT');
    expect(res.body.data.items.some((w: { id: string }) => w.id === coldWalletId)).toBe(false);
    // Signer REFERENCE is exposed (kmsKeyRef) but NO private-key material.
    expect(item.signer.kmsKeyRef).toContain('kms://');
    const raw = JSON.stringify(item);
    expect(raw).not.toMatch(/privateKey|secret|mnemonic|keyMaterial|priv_key/i);
  });

  it('lists cold wallets', async () => {
    const res = await request(app).get(`/admin/treasury/cold-wallets?chain=${CHAIN}`).set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((w: { id: string }) => w.id === coldWalletId);
    expect(item).toMatchObject({ tier: 'COLD', isActive: true });
  });

  it('exposes a treasury health summary with custody positions', async () => {
    const res = await request(app).get('/admin/treasury/summary').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dualControl).toBe(false);
    expect(res.body.data.wallets.activeHot).toBeGreaterThanOrEqual(1);
    expect(res.body.data.wallets.activeCold).toBeGreaterThanOrEqual(1);
    const pos = res.body.data.positions.find((p: { asset: string }) => p.asset === ASSET);
    expect(pos).toBeTruthy();
    expect(D(pos.hot).gte(D('1000'))).toBe(true);
  });

  it('forbids a withdrawal.view-only admin from requesting a sweep', async () => {
    const res = await move(viewerToken, '/sweeps', { fromWalletId: hotWalletId, toWalletId: coldWalletId, asset: ASSET, amount: '100' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an invalid sweep direction (cold→hot as a sweep)', async () => {
    const res = await move(adminAToken, '/sweeps', { fromWalletId: coldWalletId, toWalletId: hotWalletId, asset: ASSET, amount: '100' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_SWEEP_WALLETS');
  });

  it('rejects a sweep exceeding the hot custody balance', async () => {
    const res = await move(adminAToken, '/sweeps', { fromWalletId: hotWalletId, toWalletId: coldWalletId, asset: ASSET, amount: '999999' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_CUSTODY_BALANCE');
  });

  it('runs the full sweep flow: request → SoD block → approve → ledger move', async () => {
    const hotBefore = await custody('HOT_WALLET', ASSET);
    const coldBefore = await custody('COLD_WALLET', ASSET);

    const req = await move(adminAToken, '/sweeps', { fromWalletId: hotWalletId, toWalletId: coldWalletId, asset: ASSET, amount: '300', reason: 'rebalance' });
    expect(req.status).toBe(201);
    expect(req.body.data.status).toBe('PENDING_APPROVAL');
    expect(req.body.data.type).toBe('SWEEP');
    const transferId = req.body.data.id;

    // Separation of duties — the requester cannot approve their own transfer.
    const self = await move(adminAToken, `/transfers/${transferId}/approve`, {});
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');

    const approve = await move(adminBToken, `/transfers/${transferId}/approve`, {});
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('COMPLETED');
    expect(approve.body.data.ledgerTxnId).toBeTruthy();
    expect(approve.body.data.txHash).toContain('mock-treasury-');

    // Ledger moved 300 USDT hot → cold.
    expect((await custody('HOT_WALLET', ASSET)).toFixed()).toBe(hotBefore.sub('300').toFixed());
    expect((await custody('COLD_WALLET', ASSET)).toFixed()).toBe(coldBefore.add('300').toFixed());

    // Audit trail (admin_logs) recorded the execution.
    const logged = await prisma.adminLog.findFirst({ where: { adminId: adminBId, action: 'treasury.transfer_executed', targetId: transferId } });
    expect(logged).toBeTruthy();
  });

  it('runs the refill flow: cold→hot, approved by a distinct admin', async () => {
    const hotBefore = await custody('HOT_WALLET', ASSET);
    const coldBefore = await custody('COLD_WALLET', ASSET);

    const req = await move(adminBToken, '/refills', { fromWalletId: coldWalletId, toWalletId: hotWalletId, asset: ASSET, amount: '120' });
    expect(req.status).toBe(201);
    expect(req.body.data.type).toBe('REFILL');
    const transferId = req.body.data.id;

    const approve = await move(adminAToken, `/transfers/${transferId}/approve`, {});
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('COMPLETED');

    expect((await custody('HOT_WALLET', ASSET)).toFixed()).toBe(hotBefore.add('120').toFixed());
    expect((await custody('COLD_WALLET', ASSET)).toFixed()).toBe(coldBefore.sub('120').toFixed());
  });

  it('rejects a transfer with a reason and moves no funds', async () => {
    const hotBefore = await custody('HOT_WALLET', ASSET);
    const req = await move(adminAToken, '/sweeps', { fromWalletId: hotWalletId, toWalletId: coldWalletId, asset: ASSET, amount: '50' });
    expect(req.status).toBe(201);
    const transferId = req.body.data.id;

    const reject = await move(adminBToken, `/transfers/${transferId}/reject`, { reason: 'not now' });
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe('REJECTED');

    // No ledger movement on reject.
    expect((await custody('HOT_WALLET', ASSET)).toFixed()).toBe(hotBefore.toFixed());

    // A rejected transfer cannot then be approved.
    const late = await move(adminBToken, `/transfers/${transferId}/approve`, {});
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATE');
  });

  it('lists transfer history with filters', async () => {
    const res = await request(app).get(`/admin/treasury/transfers?chain=${CHAIN}&asset=${ASSET}`).set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(3);
    expect(res.body.data.items[0]).toHaveProperty('status');

    const completed = await request(app).get('/admin/treasury/transfers?status=COMPLETED').set('Authorization', `Bearer ${viewerToken}`);
    expect(completed.status).toBe(200);
    expect(completed.body.data.items.every((t: { status: string }) => t.status === 'COMPLETED')).toBe(true);
  });
});
