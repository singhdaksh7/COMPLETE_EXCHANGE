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

  // Spot-trading reference data: assets, the USDT/INR market, and the admin
  // monitoring permission. USDT/INR is the only supported pair for now.
  for (const [symbol, name, decimals, kind] of [
    ['INR', 'Indian Rupee', 2, 'FIAT'],
    ['USDT', 'Tether USD', 6, 'CRYPTO'],
  ] as Array<[string, string, number, 'FIAT' | 'CRYPTO']>) {
    await prisma.asset.upsert({
      where: { symbol },
      update: {},
      create: { symbol, name, decimals, kind },
    });
  }

  await prisma.market.upsert({
    where: { symbol: 'USDT-INR' },
    update: {},
    create: {
      symbol: 'USDT-INR',
      baseAsset: 'USDT',
      quoteAsset: 'INR',
      status: 'ACTIVE',
      tickSize: '0.01',
      stepSize: '0.000001',
      minNotional: '10',
      makerFeeBps: 10,
      takerFeeBps: 20,
    },
  });

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
