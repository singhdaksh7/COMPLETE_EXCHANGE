import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { inrWithdrawalService } from '../../src/modules/inr-withdrawal/inr-withdrawal.service';

/**
 * Regression for the INR withdrawal reject / mark-paid ledger UUID bug.
 *
 * `LedgerTransaction.referenceId` is a UUID column (`@db.Uuid`). The reject and
 * mark-paid flows previously composed `${id}:release` / `${id}:payout` into it,
 * which Postgres/Prisma rejected with P2023 ("Error creating UUID … found ':'").
 * These tests run against the REAL DB so the column type is actually enforced —
 * the prior unit tests mocked the ledger and never caught it.
 *
 * The fix keeps idempotency by disambiguating each movement with a DISTINCT
 * referenceType (inr_withdrawal / _release / _payout) while referenceId stays the
 * bare withdrawal UUID.
 */

async function servicesUp(): Promise<boolean> {
  try {
    await connectRedis();
    const redisOk = await isRedisHealthy();
    const dbOk = await prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    return redisOk && dbOk;
  } catch {
    return false;
  }
}

const up = await servicesUp();
const d = up ? describe : describe.skip;

/** available - n, formatted the same way LedgerService reports balances. */
function minus(available: string, n: number): string {
  return new Prisma.Decimal(available).sub(n).toFixed();
}

d('INR withdrawal reject / mark-paid ledger (integration)', () => {
  const suffix = randomUUID().slice(0, 8);
  let userId = '';
  let adminId = '';

  async function fundInr(amount: string): Promise<void> {
    await ledgerService.post(
      {
        kind: 'TEST_INR_FUNDING',
        referenceType: 'inr_withdrawal_test_funding',
        referenceId: randomUUID(),
        lines: [
          { kind: 'GATEWAY_CLEARING', userId: null, asset: 'INR', direction: 'DEBIT', amount },
          { kind: 'USER_AVAILABLE', userId, asset: 'INR', direction: 'CREDIT', amount },
        ],
      },
      { userId },
    );
  }

  /** Net balance of the system MANUAL_BANK_CLEARING account (null if absent). */
  async function clearingProjection(): Promise<string | null> {
    const acct = await prisma.account.findFirst({
      where: { userId: null, asset: 'INR', kind: 'MANUAL_BANK_CLEARING' },
    });
    if (!acct) return null;
    return (await ledgerService.reconcileAccount(acct.id)).projection;
  }

  beforeAll(async () => {
    await prisma.asset.upsert({
      where: { symbol: 'INR' },
      update: {},
      create: { symbol: 'INR', name: 'Indian Rupee', kind: 'FIAT', decimals: 2 },
    });
    const user = await prisma.user.create({
      data: {
        email: `inrwd_${suffix}@example.com`,
        passwordHash: await hash('Str0ngPassword'),
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
        kycStatus: 'APPROVED',
        kycTier: 1,
      },
    });
    userId = user.id;
    const admin = await prisma.admin.create({
      data: {
        email: `inrwd_admin_${suffix}@example.com`,
        passwordHash: await hash('Str0ngPassword'),
        totpSecretEnc: Buffer.from('00', 'hex'),
      },
    });
    adminId = admin.id;
    await fundInr('100000.00');
  });

  afterAll(async () => {
    // Ledger / audit / admin_logs rows are append-only — leave them. User and
    // admin rows are unique per run. Best-effort: drop the withdrawal rows.
    try {
      await prisma.inrWithdrawal.deleteMany({ where: { userId } });
    } catch {
      /* best-effort */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  // 5. The column contract the bug violated: a composite (colon) referenceId is
  //    rejected by the UUID column with P2023 — exactly what the old reject /
  //    mark-paid code did.
  it('a composite (colon) referenceId is rejected by the UUID column with P2023', async () => {
    await expect(
      ledgerService.post(
        {
          kind: 'INR_WITHDRAWAL_RELEASE',
          referenceType: 'inr_withdrawal_release',
          referenceId: `${randomUUID()}:release`,
          lines: [
            { kind: 'USER_LOCKED', userId, asset: 'INR', direction: 'DEBIT', amount: '1.00' },
            { kind: 'USER_AVAILABLE', userId, asset: 'INR', direction: 'CREDIT', amount: '1.00' },
          ],
        },
        { userId },
      ),
    ).rejects.toMatchObject({ code: 'P2023' });
  });

  // 1 + 3. Reject releases the hold and is idempotent (no double release).
  it('admin reject releases the hold and does not double-release on replay', async () => {
    const before = await ledgerService.getInrWallet(userId);

    const wd = await inrWithdrawalService.requestWithdrawal(userId, {
      amount: '500',
      method: 'UPI',
      upiId: 'alice@okhdfc',
    });
    const locked = await ledgerService.getInrWallet(userId);
    expect(locked.locked).toBe('500');
    expect(locked.available).toBe(minus(before.available, 500));

    // Previously-failing call — must succeed with NO P2023.
    const rejected = await inrWithdrawalService.reject(
      wd.id,
      { reason: 'manual review failed' },
      { actorId: adminId },
    );
    expect(rejected.status).toBe('REJECTED');

    const afterReject = await ledgerService.getInrWallet(userId);
    expect(afterReject.locked).toBe('0');
    expect(afterReject.available).toBe(before.available);

    // Replay: idempotent, returns REJECTED, funds not released a second time.
    const replay = await inrWithdrawalService.reject(
      wd.id,
      { reason: 'manual review failed' },
      { actorId: adminId },
    );
    expect(replay.status).toBe('REJECTED');
    const afterReplay = await ledgerService.getInrWallet(userId);
    expect(afterReplay.available).toBe(before.available);
    expect(afterReplay.locked).toBe('0');
  });

  // 2 + 4. Mark-paid moves locked -> manual clearing and is idempotent.
  it('admin mark-paid moves locked funds to manual clearing without double-paying', async () => {
    const before = await ledgerService.getInrWallet(userId);

    const wd = await inrWithdrawalService.requestWithdrawal(userId, {
      amount: '700',
      method: 'UPI',
      upiId: 'alice@okhdfc',
    });
    await inrWithdrawalService.approve(wd.id, { actorId: adminId });

    // Previously-failing call — must succeed with NO P2023.
    const paid = await inrWithdrawalService.markPaid(
      wd.id,
      { utr: 'UTR99887766' },
      { actorId: adminId },
    );
    expect(paid.status).toBe('PAID');

    const afterPaid = await ledgerService.getInrWallet(userId);
    // 700 left the user entirely (USER_LOCKED -> MANUAL_BANK_CLEARING).
    expect(afterPaid.locked).toBe('0');
    expect(afterPaid.available).toBe(minus(before.available, 700));

    const clearingAfterPaid = await clearingProjection();

    // Replay: idempotent — user balance and clearing account both unchanged.
    const replay = await inrWithdrawalService.markPaid(
      wd.id,
      { utr: 'UTR99887766' },
      { actorId: adminId },
    );
    expect(replay.status).toBe('PAID');
    const afterReplay = await ledgerService.getInrWallet(userId);
    expect(afterReplay.available).toBe(afterPaid.available);
    expect(afterReplay.locked).toBe('0');
    expect(await clearingProjection()).toBe(clearingAfterPaid);
  });

  // 6. Invalid transitions remain rejected after the fix.
  it('rejects invalid transitions (mark-paid from PENDING, reject after PAID)', async () => {
    const pending = await inrWithdrawalService.requestWithdrawal(userId, {
      amount: '300',
      method: 'UPI',
      upiId: 'alice@okhdfc',
    });
    await expect(
      inrWithdrawalService.markPaid(pending.id, { utr: 'UTRX' }, { actorId: adminId }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE' });

    // Drive it through to PAID, then a reject must be refused.
    await inrWithdrawalService.approve(pending.id, { actorId: adminId });
    await inrWithdrawalService.markPaid(pending.id, { utr: 'UTRPAID1' }, { actorId: adminId });
    await expect(
      inrWithdrawalService.reject(pending.id, { reason: 'too late' }, { actorId: adminId }),
    ).rejects.toMatchObject({ errorCode: 'ALREADY_PAID' });
  });
});
