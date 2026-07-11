/**
 * One-time backfill: mark existing password-account users as email-verified
 * so re-enabling the mandatory verification gate (removing the
 * ALLOW_UNVERIFIED_LOGIN staging bypass) does not lock out every account that
 * already exists. Run ONCE, immediately before flipping the bypass off.
 *
 * Policy: any user created BEFORE this script runs, with no `emailVerifiedAt`
 * and not soft-deleted, is grandfathered in as verified (`emailVerifiedAt =
 * createdAt`, so the audit trail reads as "verified at signup" rather than a
 * fabricated later timestamp). Any user created AFTER this cutover goes
 * through the real verification flow — this script only ever looks backward,
 * never forward, so it is safe to leave in the repo and re-run: rows already
 * marked verified are excluded by the `emailVerifiedAt: null` filter, making
 * re-runs a no-op.
 *
 * Compiled into dist/scripts so it can run inside the deployed container
 * (matches seed-demo-market.ts's convention):
 *
 *   node dist/scripts/backfill-email-verified.js
 *
 * Gate: ALLOW_EMAIL_VERIFIED_BACKFILL must equal "YES" (cannot run by accident).
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  if (process.env.ALLOW_EMAIL_VERIFIED_BACKFILL !== 'YES') {
    console.error('✗ Refusing to run: ALLOW_EMAIL_VERIFIED_BACKFILL must be set to "YES".');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const candidates = await prisma.user.findMany({
      where: { emailVerifiedAt: null, deletedAt: null },
      select: { id: true, email: true, createdAt: true },
    });

    console.log(`Found ${candidates.length} existing unverified user(s) to backfill.`);

    let updated = 0;
    for (const u of candidates) {
      const result = await prisma.user.updateMany({
        where: { id: u.id, emailVerifiedAt: null },
        data: { emailVerifiedAt: u.createdAt },
      });
      updated += result.count;
    }

    console.log(`✓ Backfill complete: ${updated} user(s) marked verified (emailVerifiedAt = createdAt).`);
  } finally {
    await prisma.$disconnect();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ backfill-email-verified failed:', err);
  process.exit(1);
});
