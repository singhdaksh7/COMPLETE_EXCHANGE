/**
 * STAGING KYC approve — compiled into dist/scripts so it can run inside the
 * deployed container (e.g. an ECS run-task):
 *
 *   node dist/scripts/approve-staging-kyc.js
 *
 * Marks a single test user's KYC as APPROVED at tier 1 so they can use the
 * KYC-gated INR rails (manual deposit submission). It writes ONLY the two fields
 * the deposit gate checks — `kycStatus` and `kycTier` — on the `users` row. It
 * does NOT touch the KYC provider integration, SES, Google, or any document
 * pipeline; it is a staging convenience to unblock manual-INR testing.
 *
 * Two explicit gates make this safe to ship in a production-mode image:
 *   - ALLOW_STAGING_KYC_APPROVE must equal "YES" (otherwise exit 1).
 *   - KYC_APPROVE_EMAIL must be set to the target user's email (otherwise exit 1).
 */
import { PrismaClient } from '@prisma/client';

const KYC_TIER = 1;

async function main(): Promise<void> {
  // ----------------------------------------------------------------------------
  // Safety gate: refuse to run unless explicitly opted in.
  // ----------------------------------------------------------------------------
  if (process.env.ALLOW_STAGING_KYC_APPROVE !== 'YES') {
    console.error(
      '✗ Refusing to run: ALLOW_STAGING_KYC_APPROVE must be set to "YES".\n' +
        '  This script force-approves a user\'s KYC and is gated behind an\n' +
        '  explicit opt-in so it can never run by accident.',
    );
    process.exit(1);
  }

  const email = process.env.KYC_APPROVE_EMAIL;
  if (!email || email.trim().length === 0) {
    console.error(
      '✗ Refusing to run: KYC_APPROVE_EMAIL is not set.\n' +
        '  Provide the target user email via the KYC_APPROVE_EMAIL env var.',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim() },
      select: { id: true, email: true, kycStatus: true, kycTier: true },
    });
    if (!user) {
      console.error(`✗ No user found with email ${email.trim()}`);
      process.exit(1);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { kycStatus: 'APPROVED', kycTier: KYC_TIER },
      select: { id: true, email: true, kycStatus: true, kycTier: true },
    });

    console.log(
      [
        '✓ Staging KYC approved',
        `  email:      ${updated.email}`,
        `  user_id:    ${updated.id}`,
        `  was:        ${user.kycStatus} (tier ${user.kycTier})`,
        `  now:        ${updated.kycStatus} (tier ${updated.kycTier})`,
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ approve-staging-kyc failed:', err);
  process.exit(1);
});
