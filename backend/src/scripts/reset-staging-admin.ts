/**
 * STAGING admin reset — compiled into dist/scripts so it can run inside the
 * deployed container (e.g. an ECS run-task):
 *
 *   node dist/scripts/reset-staging-admin.js
 *
 * Unlike `scripts/reset-local-admin.ts` (dev-only, ts via tsx, weak hardcoded
 * password), this lives in `src/` so `npm run build` emits it to dist/scripts,
 * and it takes the password from the environment instead of hardcoding one.
 *
 * It (re)creates the bootstrap admin `admin@exchange.local`, sets the password
 * from RESET_ADMIN_PASSWORD, disables TOTP, marks the account ACTIVE, and makes
 * it a real SUPER_ADMIN. Crucially it GUARANTEES the SUPER_ADMIN role and the
 * required permissions EXIST (upsert) before linking — the previous version only
 * linked the role if it already existed, so on a DB where roles were never
 * seeded the link silently no-op'd and /admin/v1/auth/me returned roles: [].
 * The password is NEVER logged.
 *
 * Two explicit gates make this safe to ship in a production-mode image:
 *   - ALLOW_STAGING_ADMIN_RESET must equal "YES" (otherwise exit 1).
 *   - RESET_ADMIN_PASSWORD must be set (otherwise exit 1).
 *
 * It does NOT touch admin auth logic, manual INR deposits, SES, Google, or the
 * BSC scanner.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { ensureAdminRbacBaseline } from '../modules/admin-rbac/admin-rbac.baseline';

const ADMIN_EMAIL = 'admin@exchange.local';
const SUPER_ADMIN = 'SUPER_ADMIN';

// Permissions SUPER_ADMIN must hold. SUPER_ADMIN also bypasses permission checks
// in adminAuthorize, but linking these makes /admin/v1/auth/me return a populated
// `permissions` array and keeps non-bypass code paths correct.
const REQUIRED_PERMISSIONS: Array<{ code: string; description: string }> = [
  { code: 'inr.view', description: 'View INR transactions' },
  { code: 'inr.approve', description: 'Approve an INR deposit / payout' },
  { code: 'kyc.view', description: 'View KYC submissions' },
  { code: 'kyc.review', description: 'Approve / reject KYC' },
  { code: 'admin.view', description: 'View admin accounts' },
];

// Mirrors ARGON_OPTS in src/modules/auth/auth.service.ts (OWASP-aligned
// argon2id baseline) so the resulting hash verifies on the normal login path.
const ARGON_OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

async function main(): Promise<void> {
  // ----------------------------------------------------------------------------
  // Safety gate: refuse to run unless explicitly opted in.
  // ----------------------------------------------------------------------------
  if (process.env.ALLOW_STAGING_ADMIN_RESET !== 'YES') {
    console.error(
      '✗ Refusing to run: ALLOW_STAGING_ADMIN_RESET must be set to "YES".\n' +
        '  This script resets the bootstrap admin credentials and is gated\n' +
        '  behind an explicit opt-in so it can never run by accident.',
    );
    process.exit(1);
  }

  const password = process.env.RESET_ADMIN_PASSWORD;
  if (!password || password.trim().length === 0) {
    console.error(
      '✗ Refusing to run: RESET_ADMIN_PASSWORD is not set.\n' +
        '  Provide the new admin password via the RESET_ADMIN_PASSWORD env var.',
    );
    process.exit(1);
  }

  let adminId = '';
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hash(password, ARGON_OPTS);

    // 1. Upsert the bootstrap admin.
    const admin = await prisma.admin.upsert({
      where: { email: ADMIN_EMAIL },
      update: {
        passwordHash,
        totpEnabled: false,
        status: 'ACTIVE',
      },
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
        // Empty placeholder secret; TOTP is disabled by this reset anyway.
        totpSecretEnc: Buffer.alloc(0),
        totpEnabled: false,
        status: 'ACTIVE',
      },
    });
    adminId = admin.id;

    // 1b. GUARANTEE the full canonical RBAC baseline exists (all admin roles +
    // permissions). On a freshly-reset DB this is what populates the Admin
    // Management "add admin" role dropdown — without it only SUPER_ADMIN exists
    // and the (SUPER_ADMIN-filtered) dropdown is empty. Upsert-only; never
    // deletes or downgrades.
    await ensureAdminRbacBaseline(prisma);

    // 2. GUARANTEE the SUPER_ADMIN role exists (upsert, not find).
    const role = await prisma.role.upsert({
      where: { name: SUPER_ADMIN },
      update: {},
      create: {
        name: SUPER_ADMIN,
        scope: 'ADMIN',
        description: 'Full administrative access',
        isSystem: true,
      },
    });

    // 3. Link the admin to SUPER_ADMIN.
    await prisma.adminRole.upsert({
      where: { adminId_roleId: { adminId: admin.id, roleId: role.id } },
      update: {},
      create: { adminId: admin.id, roleId: role.id },
    });

    // 4. GUARANTEE required permissions exist and are granted to SUPER_ADMIN.
    for (const p of REQUIRED_PERMISSIONS) {
      const permission = await prisma.permission.upsert({
        where: { code: p.code },
        update: {},
        create: { code: p.code, description: p.description },
      });
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    // Success log — deliberately NEVER prints the password.
    console.log(
      [
        '✓ Staging bootstrap admin reset',
        `  email:        ${ADMIN_EMAIL}`,
        `  admin_id:     ${admin.id}`,
        '  password:     (set from RESET_ADMIN_PASSWORD — not shown)',
        '  totp_enabled: false',
        '  status:       ACTIVE',
        `  role:         ${SUPER_ADMIN} (linked)`,
        `  permissions:  ${REQUIRED_PERMISSIONS.map((p) => p.code).join(', ')}`,
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }

  // Best-effort: bust the per-admin RBAC cache so /admin/v1/auth/me reflects the
  // new role immediately. If Redis is unreachable, the cache self-expires within
  // RBAC_CACHE_TTL_SEC (default 60s), so this is non-fatal either way.
  if (adminId) {
    try {
      const { authRedisDel, disconnectRedis } = await import('../lib/redis');
      await authRedisDel(`admin:rbac:perms:${adminId}`);
      await disconnectRedis();
      console.log('  rbac_cache:   invalidated');
    } catch {
      console.log(
        '  rbac_cache:   not invalidated (expires within RBAC_CACHE_TTL_SEC)',
      );
    }
  }

  // Explicit exit so any lingering Redis handle cannot keep the task alive.
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ reset-staging-admin failed:', err);
  process.exit(1);
});
