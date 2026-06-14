import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { adminApiRouter } from '../../src/routes/admin';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken, signAdminAccessToken } from '../../src/lib/jwt';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { createMockTronProvider } from '../../src/modules/scanner/providers/tron.mock';
import { runTronScanCycle } from '../../src/modules/scanner/scanner.worker';

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
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

async function usdtAvailable(userId: string): Promise<string> {
  const wallets = await ledgerService.listWallets(userId);
  return wallets.find((w) => w.asset.toUpperCase() === 'USDT')?.available ?? '0';
}

d('TRC20 USDT deposit scanner (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const email = `scanuser_${suffix}@example.com`;
  const adminEmail = `scanadmin_${suffix}@example.com`;
  const sessionId = randomUUID();
  const adminSessionId = randomUUID();
  const roleName = `SCANNER_TEST_${suffix}`;
  const depositAddress = `Tdeposit_${suffix}`;
  const derivationIndex = BigInt(Math.floor(Math.random() * 1_000_000_000)) + 5_000_000_000n;

  let userId = '';
  let adminId = '';
  let roleId = '';
  let accessToken = '';
  let adminToken = '';
  let contract = '';
  let decimals = 6;
  let reqConf = 20;

  const provider = createMockTronProvider();
  const txA = `txA_${suffix}`;
  const txB = `txB_${suffix}`;
  let amountBaseA = '';

  beforeAll(async () => {
    // Reference data (idempotent across parallel test files).
    for (const [symbol, name, dec] of [
      ['USDT', 'Tether USD', 6],
      ['TRX', 'TRON', 6],
    ] as Array<[string, string, number]>) {
      await prisma.asset.upsert({
        where: { symbol },
        update: {},
        create: { symbol, name, kind: 'CRYPTO', decimals: dec },
      });
    }
    await prisma.chain.upsert({
      where: { id: 'TRON' },
      update: {},
      create: { id: 'TRON', name: 'TRON', family: 'TRON', nativeAsset: 'TRX' },
    });
    await prisma.assetChain.upsert({
      where: { asset_chain: { asset: 'USDT', chain: 'TRON' } },
      update: {},
      create: {
        asset: 'USDT',
        chain: 'TRON',
        contractAddr: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        decimals: 6,
        minConfirmations: 20,
      },
    });
    const token = await prisma.assetChain.findUniqueOrThrow({
      where: { asset_chain: { asset: 'USDT', chain: 'TRON' } },
    });
    contract = token.contractAddr ?? '';
    decimals = token.decimals;
    reqConf = token.minConfirmations;
    // 1.5 USDT in base units, computed with BigInt (never a float).
    amountBaseA = (15n * 10n ** BigInt(decimals - 1)).toString();

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hash('Str0ngPassword'),
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
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

    // The user's active TRON deposit address (what the scanner matches against).
    await prisma.depositAddress.create({
      data: {
        userId,
        chain: 'TRON',
        address: depositAddress,
        derivationIndex,
        isActive: true,
      },
    });

    // Admin authorized via the seeded 'deposit.view' permission (NOT SUPER_ADMIN,
    // to avoid interfering with the admin-rbac integration test in parallel).
    const depositView = await prisma.permission.upsert({
      where: { code: 'deposit.view' },
      update: {},
      create: { code: 'deposit.view', description: 'View deposits' },
    });
    const role = await prisma.role.create({
      data: { name: roleName, scope: 'ADMIN', description: 'Scanner test role' },
    });
    roleId = role.id;
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: depositView.id },
    });
    const admin = await prisma.admin.create({
      data: {
        email: adminEmail,
        passwordHash: await hash('AdminPassw0rd!'),
        totpSecretEnc: Buffer.alloc(0),
        totpEnabled: false,
        status: 'ACTIVE',
      },
    });
    adminId = admin.id;
    await prisma.adminRole.create({ data: { adminId, roleId: role.id } });
    await prisma.adminSession.create({
      data: {
        id: adminSessionId,
        adminId,
        refreshHash: `admin_refresh_${suffix}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    adminToken = signAdminAccessToken({ sub: adminId, sid: adminSessionId });

    // Reset the persisted TRON cursor so this run scans from genesis.
    await prisma.chainCursor.deleteMany({ where: { chain: 'TRON' } });
  });

  afterAll(async () => {
    try {
      await prisma.cryptoDeposit.deleteMany({ where: { userId } });
      await prisma.depositAddress.deleteMany({ where: { userId } });
      await prisma.chainCursor.deleteMany({ where: { chain: 'TRON' } });
      await prisma.authSession.deleteMany({ where: { userId } });
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

  it('detects a TRC20 transfer but does NOT credit before min confirmations', async () => {
    provider.addTransfer({
      txHash: txA,
      logIndex: 0,
      from: 'TsenderA',
      to: depositAddress,
      contract,
      amountBase: amountBaseA,
      blockNumber: 10n,
    });
    provider.setHead(12n); // depth = 3, below reqConf

    const { scan } = await runTronScanCycle(provider);
    expect(scan.detected).toBe(1);

    const deposit = await prisma.cryptoDeposit.findFirstOrThrow({
      where: { chain: 'TRON', txHash: txA },
    });
    expect(['DETECTED', 'CONFIRMING']).toContain(deposit.status);
    expect(deposit.blockHash).toBe('tron_block_10');
    expect(await usdtAvailable(userId)).toBe('0'); // not credited yet
  });

  it('credits the user via the ledger once min confirmations are reached', async () => {
    provider.setHead(10n + BigInt(reqConf) + 5n); // depth >= reqConf

    const { confirm } = await runTronScanCycle(provider);
    expect(confirm.credited).toBe(1);

    const deposit = await prisma.cryptoDeposit.findFirstOrThrow({
      where: { chain: 'TRON', txHash: txA },
    });
    expect(deposit.status).toBe('CREDITED');
    expect(deposit.creditedTxnId).toBeTruthy();
    expect(await usdtAvailable(userId)).toBe('1.5');

    // The credit is a real balanced double-entry posting.
    const ledgerTxn = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { referenceType: 'crypto_deposit', referenceId: deposit.id },
      include: { entries: true },
    });
    expect(ledgerTxn.kind).toBe('DEPOSIT_CREDIT');
    expect(ledgerTxn.entries).toHaveLength(2);
  });

  it('does NOT double-credit on a duplicate scan of the same transaction', async () => {
    // Re-run the cycle with the same head — the tx is already CREDITED.
    const { confirm } = await runTronScanCycle(provider);
    expect(confirm.credited).toBe(0);
    expect(await usdtAvailable(userId)).toBe('1.5'); // unchanged

    const deposit = await prisma.cryptoDeposit.findFirstOrThrow({
      where: { chain: 'TRON', txHash: txA },
    });
    const ledgerCount = await prisma.ledgerTransaction.count({
      where: { referenceType: 'crypto_deposit', referenceId: deposit.id },
    });
    expect(ledgerCount).toBe(1); // exactly one credit, ever
  });

  it('orphans a deposit whose block was reorged away (before crediting)', async () => {
    const head = 10n + BigInt(reqConf) + 5n;
    const blockB = head - 2n; // near the tip, inside the rolling reorg window
    provider.addTransfer({
      txHash: txB,
      logIndex: 0,
      from: 'TsenderB',
      to: depositAddress,
      contract,
      amountBase: amountBaseA,
      blockNumber: blockB,
    });
    // Detect txB (still confirming).
    await runTronScanCycle(provider);
    let depositB = await prisma.cryptoDeposit.findFirstOrThrow({
      where: { chain: 'TRON', txHash: txB },
    });
    expect(['DETECTED', 'CONFIRMING']).toContain(depositB.status);

    // Reorg: the block is re-mined under a new hash and the tx disappears.
    provider.setBlockHash(blockB, `reorged_${blockB}`);
    provider.removeTransfer(txB, 0);
    await runTronScanCycle(provider);

    depositB = await prisma.cryptoDeposit.findFirstOrThrow({
      where: { chain: 'TRON', txHash: txB },
    });
    expect(depositB.status).toBe('ORPHANED');
    expect(await usdtAvailable(userId)).toBe('1.5'); // never credited
  });

  it('persists the cursor so a restart resumes from chain_cursors', async () => {
    const cursor = await prisma.chainCursor.findUniqueOrThrow({
      where: { chain: 'TRON' },
    });
    const head = 10n + BigInt(reqConf) + 5n;
    expect(cursor.lastScannedBlock).toBe(head - 1n); // head - SAFETY_LAG(1)
    expect(cursor.safeBlock).toBe(head - 1n);
    expect(cursor.lastScannedHash).toBeTruthy();
  });

  it('exposes scanner health + deposit monitoring to admins', async () => {
    const health = await request(app)
      .get('/admin/scanner/health')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(health.status).toBe(200);
    expect(health.body.data.chain).toBe('TRON');
    expect(health.body.data.provider.mode).toBe('mock');
    expect(health.body.data.cursor).toBeTruthy();
    expect(health.body.data.depositCounts.CREDITED).toBeGreaterThanOrEqual(1);

    const deposits = await request(app)
      .get(`/admin/scanner/deposits?status=CREDITED&userId=${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deposits.status).toBe(200);
    expect(
      deposits.body.data.items.some(
        (dep: { txHash: string; status: string }) =>
          dep.txHash === txA && dep.status === 'CREDITED',
      ),
    ).toBe(true);
  });

  it('rejects a public user token on the admin scanner routes', async () => {
    const res = await request(app)
      .get('/admin/scanner/health')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });
});
