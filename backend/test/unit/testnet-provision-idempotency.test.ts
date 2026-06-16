import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 5.6 — guard against the 42P10 ON CONFLICT trap in provision-wallets.
 *
 * `users.email` and `withdrawal_addresses(user_id,chain,address)` are backed by
 * PARTIAL unique indexes (`WHERE deleted_at IS NULL`). Prisma `upsert` on those
 * emits `ON CONFLICT (...)` which Postgres cannot infer → error 42P10. The
 * provisioning script must therefore use findFirst + create/update for these two
 * models. This static check keeps the script idempotent and regression-proof
 * without needing a live DB.
 */
const src = readFileSync(
  join(__dirname, '..', '..', 'scripts', 'testnet', 'provision-wallets.ts'),
  'utf8',
);

describe('provision-wallets avoids partial-index ON CONFLICT upserts', () => {
  it('does not call prisma.user.upsert', () => {
    expect(src).not.toMatch(/prisma\.user\.upsert/);
  });

  it('does not call prisma.withdrawalAddress.upsert', () => {
    expect(src).not.toMatch(/prisma\.withdrawalAddress\.upsert/);
  });

  it('resolves the demo user via findFirst (active rows only)', () => {
    expect(src).toMatch(/prisma\.user\.findFirst\(\{\s*where:\s*\{\s*email,\s*deletedAt:\s*null/);
  });

  it('resolves the withdrawal destination via findFirst', () => {
    expect(src).toMatch(/prisma\.withdrawalAddress\.findFirst/);
  });

  it('still uses upsert for the plain-unique custody rows (signer + hot wallet)', () => {
    // These target NON-partial unique indexes, so ON CONFLICT is valid + idempotent.
    expect(src).toMatch(/prisma\.chainSigner\.upsert/);
    expect(src).toMatch(/prisma\.hotWallet\.upsert/);
  });
});
