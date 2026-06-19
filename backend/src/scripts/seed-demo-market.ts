/**
 * STAGING demo market activity — compiled into dist/scripts so it can run inside
 * the deployed container (e.g. an ECS run-task):
 *
 *   node dist/scripts/seed-demo-market.js
 *
 * Places a handful of NON-CROSSING resting LIMIT orders (a few BUYs below the
 * base price, a few SELLs above it) for an EXISTING, KYC-approved, funded demo
 * user, so the order book has visible depth during a demo.
 *
 * Safety / accounting:
 *   - It does NOT create users, credit balances, or touch the ledger directly.
 *     Orders go through the SAME validated `tradingService.placeOrder` path a
 *     real user uses, which locks funds via the double-entry ledger. If the
 *     demo user is unfunded, that path cleanly REJECTS the order — no corruption.
 *   - Orders are intentionally non-crossing so nothing matches/settles; they
 *     simply rest in the book.
 *   - The matching engine is NOT modified.
 *
 * Gates (cannot run by accident):
 *   - ALLOW_STAGING_MARKET_SEED must equal "YES" (otherwise exit 1).
 *   - DEMO_USER_EMAIL must be set to the funded demo user (otherwise exit 1).
 *
 * Prerequisite: fund the demo user first (approve KYC → manual INR deposit →
 * convert some INR to USDT) so BUY orders have INR and SELL orders have USDT.
 *
 * It does NOT touch admin/manual-INR business logic, SES, Google, or the BSC
 * scanner.
 */
import { PrismaClient } from '@prisma/client';
import { connectRedis, disconnectRedis } from '../lib/redis';
import { tradingService } from '../modules/trading/trading.service';

const SYMBOL = process.env.DEMO_SYMBOL ?? 'USDT-INR';
const BASE_PRICE = Number(process.env.DEMO_BASE_PRICE ?? '85.00');
const QTY = process.env.DEMO_QTY ?? '5';
const LEVELS = 3;
const STEP = 0.5; // price step away from base per level

async function main(): Promise<void> {
  if (process.env.ALLOW_STAGING_MARKET_SEED !== 'YES') {
    console.error(
      '✗ Refusing to run: ALLOW_STAGING_MARKET_SEED must be set to "YES".',
    );
    process.exit(1);
  }
  const email = process.env.DEMO_USER_EMAIL;
  if (!email || email.trim().length === 0) {
    console.error('✗ Refusing to run: DEMO_USER_EMAIL is not set.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  await connectRedis().catch(() => undefined);
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim() },
      select: { id: true, email: true, kycStatus: true, kycTier: true },
    });
    if (!user) {
      console.error(`✗ No user found with email ${email.trim()}`);
      process.exit(1);
    }
    if (user.kycStatus !== 'APPROVED') {
      console.error(
        `✗ Demo user KYC is ${user.kycStatus}; approve KYC before seeding orders.`,
      );
      process.exit(1);
    }

    // Non-crossing ladder: BUYs strictly below base, SELLs strictly above.
    const plan: Array<{ side: 'BUY' | 'SELL'; price: string }> = [];
    for (let i = 1; i <= LEVELS; i++) {
      plan.push({ side: 'BUY', price: (BASE_PRICE - STEP * i).toFixed(2) });
      plan.push({ side: 'SELL', price: (BASE_PRICE + STEP * i).toFixed(2) });
    }

    let placed = 0;
    let rejected = 0;
    for (const o of plan) {
      try {
        const result = await tradingService.placeOrder(user.id, {
          symbol: SYMBOL,
          side: o.side,
          type: 'LIMIT',
          tif: 'GTC',
          price: o.price,
          quantity: QTY,
        });
        if (result.status === 'REJECTED') {
          rejected++;
          console.log(`  · ${o.side} ${QTY} @ ${o.price} → REJECTED (likely unfunded)`);
        } else {
          placed++;
          console.log(`  ✓ ${o.side} ${QTY} @ ${o.price} → ${result.status}`);
        }
      } catch (err) {
        rejected++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  · ${o.side} ${QTY} @ ${o.price} → skipped (${msg})`);
      }
    }

    console.log(
      [
        '✓ Demo market seed complete',
        `  market:  ${SYMBOL}`,
        `  user:    ${user.email}`,
        `  placed:  ${placed}`,
        `  skipped: ${rejected}`,
      ].join('\n'),
    );
  } finally {
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ seed-demo-market failed:', err);
  process.exit(1);
});
