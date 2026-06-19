import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/deposit/deposit.repository', () => ({
  depositRepository: {
    adminFindDepositById: vi.fn(),
    markFirstApproval: vi.fn(),
    markManualApproved: vi.fn(),
    markManualRejected: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/modules/ledger/ledger.service', () => ({
  ledgerService: { post: vi.fn() },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { config } from '../../src/config';
import { depositRepository } from '../../src/modules/deposit/deposit.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { depositService } from '../../src/modules/deposit/deposit.service';

const repo = vi.mocked(depositRepository);
const ledger = vi.mocked(ledgerService);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ADMIN_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const DEPOSIT_ID = '22222222-2222-4222-8222-222222222222';

// Config default threshold is 50000.00; pick amounts around it.
const THRESHOLD = Number(config.inrOps.dualApprovalThreshold);
const SMALL = (THRESHOLD - 10000).toFixed(2);
const LARGE = (THRESHOLD + 10000).toFixed(2);

function makeManual(over: Record<string, unknown> = {}) {
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    type: 'DEPOSIT',
    amount: new Prisma.Decimal(LARGE),
    fee: new Prisma.Decimal('0'),
    status: 'PENDING',
    provider: 'MANUAL',
    providerOrderId: null,
    providerPaymentId: null,
    ledgerTxnId: null,
    utr: 'UTRMK123456',
    method: 'UPI',
    proofKey: null,
    firstApprovedBy: null,
    firstApprovedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    bankRef: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  ledger.post.mockResolvedValue({ id: 'ltxn_mk', kind: 'INR_DEPOSIT_MANUAL', entries: [] } as never);
});

describe('maker-checker — below threshold (single approval)', () => {
  it('credits immediately with one admin', async () => {
    repo.adminFindDepositById.mockResolvedValue(makeManual({ amount: new Prisma.Decimal(SMALL) }));
    repo.markManualApproved.mockResolvedValue({
      updated: true,
      row: makeManual({ amount: new Prisma.Decimal(SMALL), status: 'SUCCESS', reviewedBy: ADMIN_A }),
    } as never);

    const dto = await depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_A });

    expect(dto.status).toBe('SUCCESS');
    expect(ledger.post).toHaveBeenCalledOnce();
    expect(repo.markFirstApproval).not.toHaveBeenCalled();
  });
});

describe('maker-checker — at/above threshold (dual approval)', () => {
  it('first approval records the approver and does NOT credit', async () => {
    repo.adminFindDepositById.mockResolvedValue(makeManual({ amount: new Prisma.Decimal(LARGE) }));
    repo.markFirstApproval.mockResolvedValue({
      updated: true,
      row: makeManual({ amount: new Prisma.Decimal(LARGE), firstApprovedBy: ADMIN_A }),
    } as never);

    const dto = await depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_A });

    expect(dto.status).toBe('PENDING');
    expect(dto.firstApprovedBy).toBe(ADMIN_A);
    expect(ledger.post).not.toHaveBeenCalled(); // no credit on first approval
    expect(repo.markManualApproved).not.toHaveBeenCalled();
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inr.deposit.manual_first_approved' }),
    );
  });

  it('blocks the SAME admin from giving the second approval', async () => {
    repo.adminFindDepositById.mockResolvedValue(
      makeManual({ amount: new Prisma.Decimal(LARGE), firstApprovedBy: ADMIN_A }),
    );

    await expect(
      depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_A }),
    ).rejects.toMatchObject({ errorCode: 'SAME_APPROVER' });

    expect(ledger.post).not.toHaveBeenCalled(); // still no credit
    expect(repo.markManualApproved).not.toHaveBeenCalled();
  });

  it('a DIFFERENT second admin credits exactly once', async () => {
    repo.adminFindDepositById.mockResolvedValue(
      makeManual({ amount: new Prisma.Decimal(LARGE), firstApprovedBy: ADMIN_A }),
    );
    repo.markManualApproved.mockResolvedValue({
      updated: true,
      row: makeManual({
        amount: new Prisma.Decimal(LARGE),
        firstApprovedBy: ADMIN_A,
        status: 'SUCCESS',
        reviewedBy: ADMIN_B,
        ledgerTxnId: 'ltxn_mk',
      }),
    } as never);

    const dto = await depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_B });

    expect(dto.status).toBe('SUCCESS');
    expect(ledger.post).toHaveBeenCalledOnce();
    expect(repo.markManualApproved).toHaveBeenCalledWith(DEPOSIT_ID, {
      reviewedBy: ADMIN_B,
      ledgerTxnId: 'ltxn_mk',
    });
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inr.deposit.manual_second_approved' }),
    );
  });

  it('no double credit: approving an already-credited dual deposit is idempotent', async () => {
    repo.adminFindDepositById.mockResolvedValue(
      makeManual({
        amount: new Prisma.Decimal(LARGE),
        firstApprovedBy: ADMIN_A,
        status: 'SUCCESS',
        reviewedBy: ADMIN_B,
      }),
    );

    const dto = await depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_B });
    expect(dto.status).toBe('SUCCESS');
    expect(ledger.post).not.toHaveBeenCalled();
  });
});
