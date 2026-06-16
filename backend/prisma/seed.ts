import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed baseline system flags used by the platform (kill switches, etc.).
  await prisma.systemFlag.upsert({
    where: { key: 'withdrawals_frozen' },
    update: {},
    create: { key: 'withdrawals_frozen', value: { enabled: false } },
  });

  await prisma.systemFlag.upsert({
    where: { key: 'maintenance_mode' },
    update: {},
    create: { key: 'maintenance_mode', value: { enabled: false } },
  });

  // Spot-trading reference data: assets, markets, and the admin monitoring
  // permission. The original USDT/INR fiat on-ramp market plus the internal
  // crypto/USDT spot pairs (BTC, ETH, BNB, SOL) — all matched on internal order
  // books, no external liquidity.
  for (const [symbol, name, decimals, kind] of [
    ['INR', 'Indian Rupee', 2, 'FIAT'],
    ['USDT', 'Tether USD', 6, 'CRYPTO'],
    ['BTC', 'Bitcoin', 8, 'CRYPTO'],
    ['ETH', 'Ethereum', 18, 'CRYPTO'],
    ['BNB', 'BNB', 18, 'CRYPTO'],
    ['SOL', 'Solana', 9, 'CRYPTO'],
  ] as Array<[string, string, number, 'FIAT' | 'CRYPTO']>) {
    await prisma.asset.upsert({
      where: { symbol },
      update: {},
      create: { symbol, name, decimals, kind },
    });
  }

  // Market metadata: tick (quote price increment), step (base lot increment),
  // minNotional (smallest order value, quote), and maker/taker fees in bps.
  // Quote = USDT for the crypto pairs; INR for the fiat on-ramp pair.
  const markets: Array<{
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    tickSize: string;
    stepSize: string;
    minNotional: string;
    makerFeeBps: number;
    takerFeeBps: number;
  }> = [
    { symbol: 'USDT-INR', baseAsset: 'USDT', quoteAsset: 'INR', tickSize: '0.01', stepSize: '0.000001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
    { symbol: 'BTC-USDT', baseAsset: 'BTC', quoteAsset: 'USDT', tickSize: '0.01', stepSize: '0.000001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
    { symbol: 'ETH-USDT', baseAsset: 'ETH', quoteAsset: 'USDT', tickSize: '0.01', stepSize: '0.00001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
    { symbol: 'BNB-USDT', baseAsset: 'BNB', quoteAsset: 'USDT', tickSize: '0.01', stepSize: '0.0001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
    { symbol: 'SOL-USDT', baseAsset: 'SOL', quoteAsset: 'USDT', tickSize: '0.001', stepSize: '0.001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
  ];

  for (const m of markets) {
    await prisma.market.upsert({
      where: { symbol: m.symbol },
      update: {},
      create: { ...m, status: 'ACTIVE' },
    });
  }

  await prisma.permission.upsert({
    where: { code: 'trading.view' },
    update: {},
    create: { code: 'trading.view', description: 'View spot markets, orders and trades' },
  });

  await prisma.permission.upsert({
    where: { code: 'market.manage' },
    update: {},
    create: { code: 'market.manage', description: 'Create / halt markets' },
  });

  // Treasury / custody management permission (Module 2). Lets a treasury admin
  // approve hot<->cold movements; withdrawal.approve also qualifies.
  //
  // NOTE: sample hot/cold WALLET rows live in prisma/seed.sql (the production
  // bootstrap), NOT here. The lightweight dev/test seed deliberately provisions
  // no hot wallets so it never collides with integration tests that assume a
  // clean wallet registry (e.g. the withdrawal hot-wallet picker).
  await prisma.permission.upsert({
    where: { code: 'treasury.manage' },
    update: {},
    create: { code: 'treasury.manage', description: 'Approve hot/cold treasury movements' },
  });

  // Compliance / FIU-AML foundation permissions (Module 3) + ops dashboard (M4).
  for (const [code, description] of [
    ['compliance.view', 'View risk profiles, alerts and compliance summary'],
    ['compliance.review', 'Evaluate users, assign/triage alerts, manual flag'],
    ['compliance.manage', 'Manage compliance configuration & overrides'],
    ['ops.view', 'View the operational health dashboard'],
  ] as Array<[string, string]>) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description } });
  }

  // Multi-chain deposit networks (Phase 5.1): TRON / Ethereum / BSC with USDT.
  // Reference data only — NO hot wallets seeded here (the lightweight dev/test
  // seed must not collide with integration tests that assume a clean registry).
  await prisma.asset.upsert({
    where: { symbol: 'TRX' },
    update: {},
    create: { symbol: 'TRX', name: 'TRON', decimals: 6, kind: 'CRYPTO' },
  });

  for (const [id, name, family, nativeAsset, confirmations] of [
    ['TRON', 'TRON', 'TRON', 'TRX', 20],
    ['ETHEREUM', 'Ethereum Mainnet', 'EVM', 'ETH', 12],
    ['BSC', 'BNB Smart Chain', 'EVM', 'BNB', 15],
  ] as Array<[string, string, 'TRON' | 'EVM', string, number]>) {
    await prisma.chain.upsert({
      where: { id },
      update: {},
      create: { id, name, family, nativeAsset, confirmations },
    });
  }

  for (const [chain, contractAddr, decimals, minConfirmations] of [
    ['TRON', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 6, 20],
    ['ETHEREUM', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 12],
    ['BSC', '0x55d398326f99059fF775485246999027B3197955', 18, 15],
  ] as Array<[string, string, number, number]>) {
    await prisma.assetChain.upsert({
      where: { asset_chain: { asset: 'USDT', chain } },
      update: {},
      create: { asset: 'USDT', chain, contractAddr, decimals, minConfirmations },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete: system flags + spot trading reference data initialized.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
