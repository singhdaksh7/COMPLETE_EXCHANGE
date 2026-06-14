/**
 * DEV-ONLY: reset the bootstrap admin's credentials for local development.
 *
 * Sets a known demo password (argon2id, same settings as the auth module),
 * disables TOTP, and keeps the account ACTIVE so you can log into the admin
 * console locally. If the bootstrap admin row does not exist yet (seed not
 * run), it is created; SUPER_ADMIN is (re)linked when that role exists so the
 * account is actually usable.
 *
 *   npm run admin:reset-local
 *
 * This is a destructive convenience for local demos ONLY. It writes a weak,
 * publicly-known password and is HARD-BLOCKED when NODE_ENV=production. It does
 * not touch the database schema.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import dotenv from 'dotenv';

dotenv.config();

// Local fallback so the script runs without a .env file, matching the default
// used by the test harness (test/setup.ts). Never used when DATABASE_URL is set.
process.env.DATABASE_URL ??=
  'postgresql://cex:cex_password@localhost:5432/cex?schema=public';

// ----------------------------------------------------------------------------
// Hard production guard. A known demo password must never reach a real system.
// ----------------------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error(
    '✗ Refusing to run: NODE_ENV=production.\n' +
      '  reset-local-admin is a local-development helper that sets a weak,\n' +
      '  publicly-known password. It is blocked outside dev/test.',
  );
  process.exit(1);
}

const ADMIN_EMAIL = 'admin@exchange.local';
const DEMO_PASSWORD = 'Admin@123456';

// Mirrors ARGON_OPTS in src/modules/auth/auth.service.ts (OWASP-aligned
// argon2id baseline) so the resulting hash verifies on the normal login path.
const ARGON_OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hash(DEMO_PASSWORD, ARGON_OPTS);

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
        // Empty placeholder secret; TOTP is disabled for the local demo anyway.
        totpSecretEnc: Buffer.alloc(0),
        totpEnabled: false,
        status: 'ACTIVE',
      },
    });

    // Best-effort: ensure the demo admin holds SUPER_ADMIN so it can actually
    // use the admin console. No-op when the role hasn't been seeded yet.
    const superRole = await prisma.role.findUnique({
      where: { name: 'SUPER_ADMIN' },
    });
    let linkedSuperAdmin = false;
    if (superRole) {
      await prisma.adminRole.upsert({
        where: { adminId_roleId: { adminId: admin.id, roleId: superRole.id } },
        update: {},
        create: { adminId: admin.id, roleId: superRole.id },
      });
      linkedSuperAdmin = true;
    }

    // eslint-disable-next-line no-console
    console.log(
      [
        `✓ Bootstrap admin reset for local development`,
        `  email:        ${ADMIN_EMAIL}`,
        `  password:     ${DEMO_PASSWORD}`,
        `  totp_enabled: false  (use 000000 in the TOTP field)`,
        `  status:       ACTIVE`,
        `  super_admin:  ${linkedSuperAdmin ? 'linked' : 'NOT linked — run `npm run db:seed` to create roles'}`,
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ reset-local-admin failed:', err);
  process.exit(1);
});
