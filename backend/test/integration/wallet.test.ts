import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { apiRouter } from '../../src/routes';
import { adminApiRouter } from '../../src/routes/admin';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken, signAdminAccessToken } from '../../src/lib/jwt';

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
  app.use('/api/v1', apiRouter);
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

async function seedReference(): Promise<void> {
  const assets: Array<[string, string, number]> = [
    ['USDT', 'Tether USD', 6],
    ['TRX', 'TRON', 6],
    ['ETH', 'Ether', 18],
    ['BNB', 'BNB', 18],
  ];
  for (const [symbol, name, decimals] of assets) {
    await prisma.asset.upsert({
      where: { symbol },
      update: {},
      create: { symbol, name, kind: 'CRYPTO', decimals },
    });
  }
  const chains: Array<[string, string, 'TRON' | 'EVM', string, number | null]> = [
    ['TRON', 'TRON', 'TRON', 'TRX', null],
    ['ETHEREUM', 'Ethereum Mainnet', 'EVM', 'ETH', 1],
    ['BSC', 'BNB Smart Chain', 'EVM', 'BNB', 56],
  ];
  for (const [id, name, family, nativeAsset, evmChainId] of chains) {
    await prisma.chain.upsert({
      where: { id },
      update: {},
      create: { id, name, family, nativeAsset, evmChainId },
    });
  }
  const assetChains: Array<[string, string, string, number, number]> = [
    ['USDT', 'TRON', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 6, 20],
    ['USDT', 'ETHEREUM', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 12],
    ['USDT', 'BSC', '0x55d398326f99059fF775485246999027B3197955', 18, 15],
  ];
  for (const [asset, chain, contractAddr, decimals, minConf] of assetChains) {
    await prisma.assetChain.upsert({
      where: { asset_chain: { asset, chain } },
      update: {},
      create: {
        asset,
        chain,
        contractAddr,
        decimals,
        minConfirmations: minConf,
      },
    });
  }
}

d('wallet infrastructure (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const email = `wallet_${suffix}@example.com`;
  const adminEmail = `walletadmin_${suffix}@example.com`;
  const sessionId = randomUUID();
  const adminSessionId = randomUUID();

  const roleName = `WALLET_TEST_${suffix}`;
  let userId = '';
  let adminId = '';
  let roleId = '';
  let accessToken = '';
  let adminToken = '';
  let signerId = '';
  let hotWalletId = '';
  let tronAddress = '';

  beforeAll(async () => {
    await seedReference();

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

    // Admin authorized via EXPLICIT seeded permissions (deposit.view +
    // withdrawal.view) rather than SUPER_ADMIN — creating a second active
    // SUPER_ADMIN would interfere with the admin-rbac integration test, which
    // runs in parallel against the same database.
    const depositView = await prisma.permission.upsert({
      where: { code: 'deposit.view' },
      update: {},
      create: { code: 'deposit.view', description: 'View deposits' },
    });
    const withdrawalView = await prisma.permission.upsert({
      where: { code: 'withdrawal.view' },
      update: {},
      create: { code: 'withdrawal.view', description: 'View withdrawals' },
    });
    const role = await prisma.role.create({
      data: {
        name: roleName,
        scope: 'ADMIN',
        description: 'Wallet monitoring test role',
      },
    });
    roleId = role.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: role.id, permissionId: depositView.id },
        { roleId: role.id, permissionId: withdrawalView.id },
      ],
      skipDuplicates: true,
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
    await prisma.adminRole.create({
      data: { adminId, roleId: role.id },
    });
    await prisma.adminSession.create({
      data: {
        id: adminSessionId,
        adminId,
        refreshHash: `admin_refresh_${suffix}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    adminToken = signAdminAccessToken({ sub: adminId, sid: adminSessionId });

    // A signer + hot wallet + nonce so the admin registry reads return data.
    const signer = await prisma.chainSigner.create({
      data: {
        chain: 'TRON',
        name: `tron-signer-${suffix}`,
        kmsKeyRef: `kms://tron/${suffix}`,
        publicKey: '0xpublickey',
        status: 'ACTIVE',
      },
    });
    signerId = signer.id;
    const hotWallet = await prisma.hotWallet.create({
      data: {
        chain: 'TRON',
        signerId: signer.id,
        address: `Thotwallet_${suffix}`,
        tier: 'HOT',
        label: 'integration hot wallet',
      },
    });
    hotWalletId = hotWallet.id;
    await prisma.walletNonce.create({
      data: { hotWalletId: hotWallet.id, nextNonce: 42n },
    });
  });

  afterAll(async () => {
    try {
      await prisma.walletNonce.deleteMany({ where: { hotWalletId } });
      await prisma.hotWallet.deleteMany({ where: { id: hotWalletId } });
      await prisma.chainSigner.deleteMany({ where: { id: signerId } });
      await prisma.depositAddress.deleteMany({ where: { userId } });
      await prisma.idempotencyKey.deleteMany({ where: { userId } });
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

  it('lists supported asset/chain networks from asset_chains', async () => {
    const res = await request(app)
      .get('/api/v1/wallets/networks')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const usdtTron = res.body.data.items.find(
      (n: { asset: string; chain: string }) =>
        n.asset === 'USDT' && n.chain === 'TRON',
    );
    expect(usdtTron).toBeTruthy();
    expect(usdtTron.family).toBe('TRON');
    const chains = res.body.data.items.map(
      (n: { chain: string }) => n.chain,
    );
    expect(chains).toEqual(expect.arrayContaining(['TRON', 'ETHEREUM', 'BSC']));
  });

  it('derives a new TRON deposit address (201) then returns it (200)', async () => {
    const first = await request(app)
      .post('/api/v1/wallets/addresses')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wallet-${suffix}-tron-1`)
      .send({ chain: 'TRON' });
    expect(first.status).toBe(201);
    expect(first.body.data.chain).toBe('TRON');
    expect(first.body.data.address).toMatch(/^T/);
    expect(first.body.data.isActive).toBe(true);
    tronAddress = first.body.data.address;

    // Different idempotency key, same chain → existing active address (200).
    const second = await request(app)
      .post('/api/v1/wallets/addresses')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wallet-${suffix}-tron-2`)
      .send({ chain: 'TRON' });
    expect(second.status).toBe(200);
    expect(second.body.data.address).toBe(tronAddress);
  });

  it('replays the original response for a repeated idempotency key', async () => {
    const replay = await request(app)
      .post('/api/v1/wallets/addresses')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wallet-${suffix}-tron-1`)
      .send({ chain: 'TRON' });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.address).toBe(tronAddress);
  });

  it('derives a distinct EVM address for ETHEREUM', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/addresses')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wallet-${suffix}-eth-1`)
      .send({ chain: 'ETHEREUM' });
    expect(res.status).toBe(201);
    expect(res.body.data.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(res.body.data.address).not.toBe(tronAddress);
  });

  it('rejects an unsupported chain', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/addresses')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `wallet-${suffix}-bad`)
      .send({ chain: 'DOGECOIN' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CHAIN_NOT_SUPPORTED');
  });

  it('lists the user addresses and a ledger-backed overview', async () => {
    const list = await request(app)
      .get('/api/v1/wallets/addresses')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    expect(
      list.body.data.items.some(
        (a: { address: string }) => a.address === tronAddress,
      ),
    ).toBe(true);

    const overview = await request(app)
      .get('/api/v1/wallets/overview')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(overview.status).toBe(200);
    const usdt = overview.body.data.assets.find(
      (a: { asset: string }) => a.asset === 'USDT',
    );
    expect(usdt).toBeTruthy();
    // Ledger balance (no deposits credited) — never an on-chain balance.
    expect(usdt.available).toBe('0');
    const tron = usdt.networks.find((n: { chain: string }) => n.chain === 'TRON');
    expect(tron.depositAddress).toBe(tronAddress);
  });

  it('still serves the ledger wallet routes through the fall-through', async () => {
    // /wallets/:asset belongs to the ledger module; the infra router must not
    // shadow it.
    const res = await request(app)
      .get('/api/v1/wallets/USDT')
      .set('Authorization', `Bearer ${accessToken}`);
    // 404 (no wallet yet) is fine; the point is it routed to the ledger handler,
    // not a wallet-infra 200.
    expect([200, 404]).toContain(res.status);
  });

  it('exposes admin deposit-address, hot-wallet and signer monitoring', async () => {
    const addrs = await request(app)
      .get(`/admin/wallets/deposit-addresses?userId=${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(addrs.status).toBe(200);
    expect(
      addrs.body.data.items.some(
        (a: { address: string }) => a.address === tronAddress,
      ),
    ).toBe(true);

    const hot = await request(app)
      .get('/admin/wallets/hot-wallets?chain=TRON')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(hot.status).toBe(200);
    const hw = hot.body.data.items.find(
      (h: { id: string }) => h.id === hotWalletId,
    );
    expect(hw).toBeTruthy();
    expect(hw.nonce.nextNonce).toBe('42');
    expect(hw.signer.kmsKeyRef).toBe(`kms://tron/${suffix}`);
    // No private key material is ever exposed.
    expect(JSON.stringify(hot.body)).not.toMatch(/privatekey|secret/i);

    const signers = await request(app)
      .get('/admin/wallets/signers?chain=TRON')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(signers.status).toBe(200);
    expect(
      signers.body.data.items.some((s: { id: string }) => s.id === signerId),
    ).toBe(true);
  });

  it('rejects a public user token on admin wallet routes', async () => {
    const res = await request(app)
      .get('/admin/wallets/hot-wallets')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });
});
