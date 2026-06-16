import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { createMockEvmProvider } from '../../src/modules/scanner/providers/evm.mock';
import { runScanCycle } from '../../src/modules/scanner/scanner.worker';
import { scannerRepository } from '../../src/modules/scanner/scanner.repository';

/**
 * Multi-chain EVM deposit scanner (Phase 5.1) — Ethereum (ERC20) + BSC (BEP20)
 * USDT via the offline EVM mock. Proves detection → confirmation → ledger
 * credit, that a duplicate scan does not double-credit, and that the per-chain
 * cursor advances/resumes. Uses the SAME scanner code path as TRON.
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

interface ChainCase {
  chain: string;
  native: string;
  contract: string;
  decimals: number;
  reqConf: number;
}

const CASES: ChainCase[] = [
  { chain: 'ETHEREUM', native: 'ETH', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, reqConf: 12 },
  { chain: 'BSC', native: 'BNB', contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, reqConf: 15 },
];

async function usdtAvailable(userId: string): Promise<string> {
  const wallets = await ledgerService.listWallets(userId);
  return wallets.find((w) => w.asset.toUpperCase() === 'USDT')?.available ?? '0';
}

d('Multi-chain EVM USDT deposit scanner (integration)', () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: Record<string, string> = {};
  const addrs: Record<string, string> = {};

  beforeAll(async () => {
    for (const [symbol, name, dec] of [
      ['USDT', 'Tether USD', 6],
      ['ETH', 'Ethereum', 18],
      ['BNB', 'BNB', 18],
    ] as Array<[string, string, number]>) {
      await prisma.asset.upsert({ where: { symbol }, update: {}, create: { symbol, name, kind: 'CRYPTO', decimals: dec } });
    }

    for (const c of CASES) {
      await prisma.chain.upsert({
        where: { id: c.chain },
        update: {},
        create: { id: c.chain, name: c.chain, family: 'EVM', nativeAsset: c.native },
      });
      await prisma.assetChain.upsert({
        where: { asset_chain: { asset: 'USDT', chain: c.chain } },
        update: { isActive: true, contractAddr: c.contract, decimals: c.decimals, minConfirmations: c.reqConf },
        create: { asset: 'USDT', chain: c.chain, contractAddr: c.contract, decimals: c.decimals, minConfirmations: c.reqConf },
      });
      // Reset this chain's cursor so the run scans from the start deterministically.
      await prisma.chainCursor.deleteMany({ where: { chain: c.chain } });

      const user = await prisma.user.create({
        data: { email: `mc_${c.chain}_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE' },
      });
      userIds[c.chain] = user.id;
      const address = `0x${c.chain.toLowerCase()}_${suffix}`;
      addrs[c.chain] = address;
      await prisma.depositAddress.create({
        data: {
          userId: user.id,
          chain: c.chain,
          address,
          derivationIndex: BigInt(Math.floor(Math.random() * 1_000_000_000)) + 7_000_000_000n,
          isActive: true,
        },
      });
    }
  });

  afterAll(async () => {
    try {
      const ids = Object.values(userIds);
      // crypto_deposits FK-reference deposit addresses; flip then delete safely.
      await prisma.cryptoDeposit.deleteMany({ where: { userId: { in: ids } } });
      await prisma.depositAddress.deleteMany({ where: { userId: { in: ids } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    } catch {
      /* best-effort */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  for (const c of CASES) {
    it(`credits a ${c.chain} USDT deposit only after confirmations (no double-credit)`, async () => {
      const provider = createMockEvmProvider(c.chain);
      const userId = userIds[c.chain];
      const to = addrs[c.chain];
      const txHash = `0xdep_${c.chain}_${suffix}`;
      const depositBlock = 5n;
      const amountBase = (2n * 10n ** BigInt(c.decimals)).toString(); // 2 USDT

      provider.addTransfer({ txHash, logIndex: 0, from: '0xsender', to, contract: c.contract, amountBase, blockNumber: depositBlock });

      // Below required depth → detected, NOT credited.
      provider.setHead(depositBlock + 3n);
      const first = await runScanCycle(c.chain, provider);
      expect(first.scan.detected).toBeGreaterThanOrEqual(1);
      expect(await usdtAvailable(userId)).toBe('0');

      // Past required depth → credited exactly once.
      provider.setHead(depositBlock + BigInt(c.reqConf) + 5n);
      const second = await runScanCycle(c.chain, provider);
      expect(second.confirm.credited).toBeGreaterThanOrEqual(1);
      expect(await usdtAvailable(userId)).toBe('2');

      // Duplicate scan → no double-credit.
      const third = await runScanCycle(c.chain, provider);
      expect(third.confirm.credited).toBe(0);
      expect(await usdtAvailable(userId)).toBe('2');

      // The deposit row carries the explicit chain + asset.
      const dep = await prisma.cryptoDeposit.findFirstOrThrow({ where: { chain: c.chain, txHash } });
      expect(dep.asset.toUpperCase()).toBe('USDT');
      expect(dep.status).toBe('CREDITED');
      expect(dep.creditedTxnId).toBeTruthy();
    });
  }

  it('advances and resumes the per-chain cursor', async () => {
    const c = CASES[0];
    const before = await scannerRepository.getCursor(c.chain);
    expect(before).not.toBeNull();
    const lastScanned = before!.lastScannedBlock;

    // Grow the head and scan again with a fresh provider instance: it must
    // resume from the persisted cursor, not rescan from genesis.
    const provider = createMockEvmProvider(c.chain, { head: lastScanned + 50n });
    const res = await runScanCycle(c.chain, provider);
    expect(BigInt(res.scan.toBlock)).toBeGreaterThan(lastScanned);

    const after = await scannerRepository.getCursor(c.chain);
    expect(after!.lastScannedBlock).toBeGreaterThan(lastScanned);
  });
});
