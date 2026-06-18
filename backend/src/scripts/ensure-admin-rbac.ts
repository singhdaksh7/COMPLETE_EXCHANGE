/**
 * STAGING RBAC baseline — compiled into dist/scripts so it can run inside the
 * deployed container (e.g. an ECS run-task):
 *
 *   node dist/scripts/ensure-admin-rbac.js
 *
 * Idempotently guarantees the canonical admin roles (SUPER_ADMIN, FINANCE,
 * KYC_REVIEWER, SUPPORT, READ_ONLY) and their permissions exist and are linked
 * (see admin-rbac.baseline.ts). Upsert-only — it never deletes or downgrades.
 *
 * Guarded so it cannot run by accident:
 *   - ALLOW_STAGING_RBAC_SEED must equal "YES" (otherwise exit 1).
 *
 * It does NOT touch admin credentials, manual INR deposits, SES, Google, or the
 * BSC scanner.
 */
import { PrismaClient } from '@prisma/client';
import { ensureAdminRbacBaseline } from '../modules/admin-rbac/admin-rbac.baseline';

async function main(): Promise<void> {
  if (process.env.ALLOW_STAGING_RBAC_SEED !== 'YES') {
    console.error(
      '✗ Refusing to run: ALLOW_STAGING_RBAC_SEED must be set to "YES".',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const result = await ensureAdminRbacBaseline(prisma);
    console.log(
      [
        '✓ Admin RBAC baseline ensured',
        `  permissions: ${result.permissions}`,
        `  roles:       ${result.roles.join(', ')}`,
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ ensure-admin-rbac failed:', err);
  process.exit(1);
});
