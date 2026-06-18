import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/deposit/deposit.repository', () => ({
  depositRepository: {
    findUserKyc: vi.fn(),
    createManualDeposit: vi.fn(),
    adminFindDepositById: vi.fn(),
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

import { ConflictError } from '../../src/lib/errors';
import { recordAudit } from '../../src/lib/audit';
import { depositRepository } from '../../src/modules/deposit/deposit.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { depositService } from '../../src/modules/deposit/deposit.service';

const repo = vi.mocked(depositRepository);
const ledger = vi.mocked(ledgerService);
const audit = vi.mocked(recordAudit);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const DEPOSIT_ID = '22222222-2222-4222-8222-222222222222';

function makeManual(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    type: 'DEPOSIT',
    amount: new Prisma.Decimal('500.00'),
    fee: new Prisma.Decimal('0'),
    status: 'PENDING',
    provider: 'MANUAL',
    providerOrderId: null,
    providerPaymentId: null,
    ledgerTxnId: null,
    utr: 'UTR12345678',
    method: 'UPI',
    proofKey: null,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    bankRef: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never;
}

const approvedKyc = {
  id: USER_ID,
  status: 'ACTIVE',
  kycStatus: 'APPROVED',
  kycTier: 1,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('depositService.createManualDeposit', () => {
  it('creates a PENDING manual deposit (provider MANUAL) and audits it', async () => {
    repo.findUserKyc.mockResolvedValue(approvedKyc);
    repo.createManualDeposit.mockResolvedValue(makeManual());

    const dto = await depositService.createManualDeposit(USER_ID, {
      amount: '500.00',
      utr: 'UTR12345678',
      method: 'UPI',
    });

    expect(dto.status).toBe('PENDING');
    expect(dto.provider).toBe('MANUAL');
    expect(dto.utr).toBe('UTR12345678');
    expect(repo.createManualDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        provider: 'MANUAL',
        utr: 'UTR12345678',
        method: 'UPI',
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inr.deposit.manual_submitted' }),
    );
  });

  it('rejects when KYC is not approved', async () => {
    repo.findUserKyc.mockResolvedValue({
      id: USER_ID,
      status: 'ACTIVE',
      kycStatus: 'PENDING',
      kycTier: 0,
    } as never);

    await expect(
      depositService.createManualDeposit(USER_ID, {
        amount: '500.00',
        utr: 'UTR12345678',
        method: 'UPI',
      }),
    ).rejects.toMatchObject({ errorCode: 'KYC_REQUIRED' });
    expect(repo.createManualDeposit).not.toHaveBeenCalled();
  });

  it('rejects amounts below the configured minimum', async () => {
    repo.findUserKyc.mockResolvedValue(approvedKyc);
    await expect(
      depositService.createManualDeposit(USER_ID, {
        amount: '1.00',
        utr: 'UTR12345678',
        method: 'UPI',
      }),
    ).rejects.toMatchObject({ errorCode: 'AMOUNT_BELOW_MINIMUM' });
    expect(repo.createManualDeposit).not.toHaveBeenCalled();
  });

  it('propagates a DUPLICATE_UTR conflict from the repository', async () => {
    repo.findUserKyc.mockResolvedValue(approvedKyc);
    repo.createManualDeposit.mockRejectedValue(
      new ConflictError('This UTR/reference has already been submitted', 'DUPLICATE_UTR'),
    );

    await expect(
      depositService.createManualDeposit(USER_ID, {
        amount: '500.00',
        utr: 'UTR12345678',
        method: 'UPI',
      }),
    ).rejects.toMatchObject({ errorCode: 'DUPLICATE_UTR' });
  });
});

describe('depositService.approveManualDeposit', () => {
  it('credits the user via a balanced MANUAL_BANK_CLEARING → USER_AVAILABLE posting', async () => {
    repo.adminFindDepositById.mockResolvedValue(makeManual({ status: 'PENDING' }));
    ledger.post.mockResolvedValue({ id: 'ltxn_m1', kind: 'INR_DEPOSIT_MANUAL', entries: [] } as never);
    repo.markManualApproved.mockResolvedValue({
      updated: true,
      row: makeManual({ status: 'SUCCESS', ledgerTxnId: 'ltxn_m1', reviewedBy: ADMIN_ID }),
    } as never);

    const dto = await depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_ID });

    expect(dto.status).toBe('SUCCESS');
    expect(ledger.post).toHaveBeenCalledOnce();
    const posting = ledger.post.mock.calls[0][0];
    expect(posting.kind).toBe('INR_DEPOSIT_MANUAL');
    expect(posting.referenceType).toBe('inr_transaction');
    expect(posting.referenceId).toBe(DEPOSIT_ID);
    expect(posting.lines).toEqual([
      expect.objectContaining({
        kind: 'MANUAL_BANK_CLEARING',
        direction: 'DEBIT',
        amount: '500.00',
        userId: null,
      }),
      expect.objectContaining({
        kind: 'USER_AVAILABLE',
        direction: 'CREDIT',
        amount: '500.00',
        userId: USER_ID,
      }),
    ]);
    expect(repo.markManualApproved).toHaveBeenCalledWith(DEPOSIT_ID, {
      reviewedBy: ADMIN_ID,
      ledgerTxnId: 'ltxn_m1',
    });
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: ADMIN_ID, action: 'inr.deposit.manual_approved' }),
    );
  });

  it('is idempotent: an already-credited deposit is not re-posted', async () => {
    repo.adminFindDepositById.mockResolvedValue(makeManual({ status: 'SUCCESS' }));

    const dto = await depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_ID });

    expect(dto.status).toBe('SUCCESS');
    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.markManualApproved).not.toHaveBeenCalled();
  });

  it('does not double-log when the conditional flip loses the race (updated=false)', async () => {
    repo.adminFindDepositById.mockResolvedValue(makeManual({ status: 'PENDING' }));
    ledger.post.mockResolvedValue({ id: 'ltxn_m1', kind: 'INR_DEPOSIT_MANUAL', entries: [] } as never);
    repo.markManualApproved.mockResolvedValue({
      updated: false,
      row: makeManual({ status: 'SUCCESS', ledgerTxnId: 'ltxn_m1' }),
    } as never);

    const dto = await depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_ID });

    expect(dto.status).toBe('SUCCESS');
    expect(repo.writeAdminLog).not.toHaveBeenCalled();
  });

  it('rejects approving a FAILED deposit', async () => {
    repo.adminFindDepositById.mockResolvedValue(makeManual({ status: 'FAILED' }));
    await expect(
      depositService.approveManualDeposit(DEPOSIT_ID, { actorId: ADMIN_ID }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE' });
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('requires an admin actor', async () => {
    await expect(
      depositService.approveManualDeposit(DEPOSIT_ID, {}),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('depositService.rejectManualDeposit', () => {
  it('marks the deposit FAILED with a reason and never posts to the ledger', async () => {
    repo.adminFindDepositById.mockResolvedValue(makeManual({ status: 'PENDING' }));
    repo.markManualRejected.mockResolvedValue({
      updated: true,
      row: makeManual({ status: 'FAILED', rejectionReason: 'no payment found', reviewedBy: ADMIN_ID }),
    } as never);

    const dto = await depositService.rejectManualDeposit(
      DEPOSIT_ID,
      { reason: 'no payment found' },
      { actorId: ADMIN_ID },
    );

    expect(dto.status).toBe('FAILED');
    expect(dto.rejectionReason).toBe('no payment found');
    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.markManualRejected).toHaveBeenCalledWith(DEPOSIT_ID, {
      reviewedBy: ADMIN_ID,
      reason: 'no payment found',
    });
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inr.deposit.manual_rejected' }),
    );
  });

  it('cannot reject an already-credited deposit', async () => {
    repo.adminFindDepositById.mockResolvedValue(makeManual({ status: 'SUCCESS' }));
    await expect(
      depositService.rejectManualDeposit(DEPOSIT_ID, { reason: 'x' }, { actorId: ADMIN_ID }),
    ).rejects.toMatchObject({ errorCode: 'ALREADY_CREDITED' });
    expect(repo.markManualRejected).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-rejected deposit', async () => {
    repo.adminFindDepositById.mockResolvedValue(
      makeManual({ status: 'FAILED', rejectionReason: 'dupe' }),
    );
    const dto = await depositService.rejectManualDeposit(
      DEPOSIT_ID,
      { reason: 'again' },
      { actorId: ADMIN_ID },
    );
    expect(dto.status).toBe('FAILED');
    expect(repo.markManualRejected).not.toHaveBeenCalled();
  });
});
