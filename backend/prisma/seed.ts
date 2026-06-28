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

  // Spot-trading reference data: core assets + markets + the admin monitoring
  // permission. INR-only mode keeps crypto funding disabled, but the crypto
  // assets/markets still exist so the trade/markets screens render real pairs
  // (no "Market not found") instead of broken 404s. There is no real liquidity.
  //
  // Idempotent: every row is an upsert keyed on its natural id, so running the
  // seed repeatedly converges to the same state with no duplicates.
  for (const [symbol, name, decimals, kind] of [
    ['INR', 'Indian Rupee', 2, 'FIAT'],
    ['USDT', 'Tether USD', 6, 'CRYPTO'],
    ['BTC', 'Bitcoin', 8, 'CRYPTO'],
    ['ETH', 'Ethereum', 8, 'CRYPTO'],
    ['BNB', 'BNB', 8, 'CRYPTO'],
  ] as Array<[string, string, number, 'FIAT' | 'CRYPTO']>) {
    await prisma.asset.upsert({
      where: { symbol },
      update: {}, // never clobber an edited asset; presence is what matters
      create: { symbol, name, decimals, kind },
    });
  }

  // tickSize  — minimum price increment (quote precision)
  // stepSize  — minimum quantity increment (base precision)
  // minNotional — smallest allowed order value in the quote asset
  // maker/takerFeeBps — basis points (10 = 0.10%)
  for (const m of [
    { symbol: 'BTC-USDT', baseAsset: 'BTC', quoteAsset: 'USDT', tickSize: '0.01', stepSize: '0.000001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
    { symbol: 'ETH-USDT', baseAsset: 'ETH', quoteAsset: 'USDT', tickSize: '0.01', stepSize: '0.00001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
    { symbol: 'BNB-USDT', baseAsset: 'BNB', quoteAsset: 'USDT', tickSize: '0.01', stepSize: '0.0001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
    { symbol: 'USDT-INR', baseAsset: 'USDT', quoteAsset: 'INR', tickSize: '0.01', stepSize: '0.000001', minNotional: '10', makerFeeBps: 10, takerFeeBps: 20 },
  ] as const) {
    await prisma.market.upsert({
      where: { symbol: m.symbol },
      update: {}, // idempotent: keep any later admin edits to fees/params
      create: { ...m, status: 'ACTIVE' },
    });
  }

  await prisma.permission.upsert({
    where: { code: 'trading.view' },
    update: {},
    create: { code: 'trading.view', description: 'View spot markets, orders and trades' },
  });

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
