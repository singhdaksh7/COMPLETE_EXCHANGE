import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/inr-withdrawal/inr-withdrawal.repository', () => ({
  inrWithdrawalRepository: {
    findUserState: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdForUser: vi.fn(),
    setLockTxn: vi.fn(),
    deleteIfPending: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    markPaid: vi.fn(),
    listForUser: vi.fn(),
    adminList: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/modules/ledger/ledger.service', () => ({
  ledgerService: { post: vi.fn(), getInrWallet: vi.fn() },
}));

vi.mock('../../src/modules/notification/notification.service', () => ({
  notificationService: { notify: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { ConflictError } from '../../src/lib/errors';
import { inrWithdrawalRepository } from '../../src/modules/inr-withdrawal/inr-withdrawal.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { inrWithdrawalService } from '../../src/modules/inr-withdrawal/inr-withdrawal.service';

const repo = vi.mocked(inrWithdrawalRepository);
const ledger = vi.mocked(ledgerService);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const WD_ID = '33333333-3333-4333-8333-333333333333';

const UPI_INPUT = { amount: '500', method: 'UPI' as const, upiId: 'alice@okhdfc' };

function wd(overrides: Record<string, unknown> = {}) {
  return {
    id: WD_ID,
    userId: USER_ID,
    amount: new Prisma.Decimal('500'),
    status: 'PENDING',
    payoutMethod: 'UPI',
    upiId: 'alice@okhdfc',
    accountNumberEnc: null,
    accountLast4: null,
    ifsc: null,
    holderName: null,
    bankName: null,
    lockLedgerTxnId: null,
    finalLedgerTxnId: null,
    approvedBy: null,
    approvedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    paidBy: null,
    paidAt: null,
    utr: null,
    adminNote: null,
    rejectionReason: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findUserState.mockResolvedValue({
    id: USER_ID,
    status: 'ACTIVE',
    kycStatus: 'APPROVED',
    kycTier: 1,
    withdrawalsBlocked: false,
    riskLevel: 'LOW',
  } as never);
  ledger.getInrWallet.mockResolvedValue({
    asset: 'INR',
    available: '10000',
    locked: '0',
    total: '10000',
  } as never);
  ledger.post.mockResolvedValue({ id: 'ledger-txn', kind: 'X', entries: [] } as never);
  repo.create.mockResolvedValue(wd());
  repo.setLockTxn.mockResolvedValue(wd({ lockLedgerTxnId: 'ledger-txn' }));
});

describe('requestWithdrawal', () => {
  it('reserves USER_AVAILABLE → USER_LOCKED and returns PENDING', async () => {
    const dto = await inrWithdrawalService.requestWithdrawal(USER_ID, UPI_INPUT);

    expect(dto.status).toBe('PENDING');
    const posting = ledger.post.mock.calls[0][0];
    expect(posting.kind).toBe('INR_WITHDRAWAL_LOCK');
    expect(posting.referenceType).toBe('inr_withdrawal');
    expect(posting.lines).toEqual([
      expect.objectContaining({ kind: 'USER_AVAILABLE', direction: 'DEBIT', amount: '500.00' }),
      expect.objectContaining({ kind: 'USER_LOCKED', direction: 'CREDIT', amount: '500.00' }),
    ]);
    expect(repo.setLockTxn).toHaveBeenCalledWith(expect.any(String), 'ledger-txn');
  });

  it('masks the UPI id in the user DTO', async () => {
    const dto = await inrWithdrawalService.requestWithdrawal(USER_ID, UPI_INPUT);
    expect(dto.payout.upiId).not.toBe('alice@okhdfc');
    expect(dto.payout.upiId).toContain('@okhdfc');
  });

  it('requires approved KYC', async () => {
    repo.findUserState.mockResolvedValue({
      id: USER_ID, status: 'ACTIVE', kycStatus: 'PENDING', kycTier: 0,
      withdrawalsBlocked: false, riskLevel: 'LOW',
    } as never);
    await expect(
      inrWithdrawalService.requestWithdrawal(USER_ID, UPI_INPUT),
    ).rejects.toMatchObject({ errorCode: 'KYC_REQUIRED' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('blocks when the account has a withdrawal block', async () => {
    repo.findUserState.mockResolvedValue({
      id: USER_ID, status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1,
      withdrawalsBlocked: true, riskLevel: 'LOW',
    } as never);
    await expect(
      inrWithdrawalService.requestWithdrawal(USER_ID, UPI_INPUT),
    ).rejects.toMatchObject({ errorCode: 'WITHDRAWALS_BLOCKED' });
  });

  it('rejects an amount below the configured minimum', async () => {
    await expect(
      inrWithdrawalService.requestWithdrawal(USER_ID, { ...UPI_INPUT, amount: '50' }),
    ).rejects.toMatchObject({ errorCode: 'AMOUNT_BELOW_MINIMUM' });
  });

  it('rejects when available balance is insufficient (pre-check)', async () => {
    ledger.getInrWallet.mockResolvedValue({ asset: 'INR', available: '100', locked: '0', total: '100' } as never);
    await expect(
      inrWithdrawalService.requestWithdrawal(USER_ID, UPI_INPUT),
    ).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_BALANCE' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rolls back the row when the reserve posting finds insufficient balance', async () => {
    ledger.post.mockRejectedValueOnce(
      new ConflictError('Insufficient balance for ledger debit', 'INSUFFICIENT_BALANCE'),
    );
    await expect(
      inrWithdrawalService.requestWithdrawal(USER_ID, UPI_INPUT),
    ).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_BALANCE' });
    expect(repo.deleteIfPending).toHaveBeenCalledWith(expect.any(String));
  });
});

describe('admin approve', () => {
  it('moves PENDING → APPROVED without touching the ledger', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'PENDING' }));
    repo.approve.mockResolvedValue({ updated: true, row: wd({ status: 'APPROVED', approvedBy: ADMIN_ID }) });

    const dto = await inrWithdrawalService.approve(WD_ID, { actorId: ADMIN_ID });
    expect(dto.status).toBe('APPROVED');
    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.approve).toHaveBeenCalledWith(WD_ID, ADMIN_ID);
  });

  it('is idempotent when already APPROVED (no second transition)', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'APPROVED', approvedBy: ADMIN_ID }));
    const dto = await inrWithdrawalService.approve(WD_ID, { actorId: ADMIN_ID });
    expect(dto.status).toBe('APPROVED');
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('rejects approving a PAID withdrawal', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'PAID' }));
    await expect(
      inrWithdrawalService.approve(WD_ID, { actorId: ADMIN_ID }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE' });
  });
});

describe('admin reject', () => {
  it('releases the hold (USER_LOCKED → USER_AVAILABLE) and flips to REJECTED', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'PENDING' }));
    repo.reject.mockResolvedValue({ updated: true, row: wd({ status: 'REJECTED', rejectionReason: 'bad' }) });

    const dto = await inrWithdrawalService.reject(WD_ID, { reason: 'bad' }, { actorId: ADMIN_ID });
    expect(dto.status).toBe('REJECTED');
    const release = ledger.post.mock.calls[0][0];
    expect(release.kind).toBe('INR_WITHDRAWAL_RELEASE');
    expect(release.referenceId).toBe(`${WD_ID}:release`);
    expect(release.lines).toEqual([
      expect.objectContaining({ kind: 'USER_LOCKED', direction: 'DEBIT', amount: '500.00' }),
      expect.objectContaining({ kind: 'USER_AVAILABLE', direction: 'CREDIT', amount: '500.00' }),
    ]);
  });

  it('is idempotent when already REJECTED (no second release)', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'REJECTED' }));
    await inrWithdrawalService.reject(WD_ID, { reason: 'bad' }, { actorId: ADMIN_ID });
    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.reject).not.toHaveBeenCalled();
  });

  it('cannot reject a PAID withdrawal', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'PAID' }));
    await expect(
      inrWithdrawalService.reject(WD_ID, { reason: 'bad' }, { actorId: ADMIN_ID }),
    ).rejects.toMatchObject({ errorCode: 'ALREADY_PAID' });
  });
});

describe('admin mark paid', () => {
  it('finalizes APPROVED → PAID (USER_LOCKED → MANUAL_BANK_CLEARING) with a UTR', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'APPROVED' }));
    repo.markPaid.mockResolvedValue({ updated: true, row: wd({ status: 'PAID', utr: 'UTR123456' }) });

    const dto = await inrWithdrawalService.markPaid(WD_ID, { utr: 'UTR123456' }, { actorId: ADMIN_ID });
    expect(dto.status).toBe('PAID');
    const fin = ledger.post.mock.calls[0][0];
    expect(fin.kind).toBe('INR_WITHDRAWAL_PAYOUT');
    expect(fin.referenceId).toBe(`${WD_ID}:payout`);
    expect(fin.lines).toEqual([
      expect.objectContaining({ kind: 'USER_LOCKED', direction: 'DEBIT', amount: '500.00' }),
      expect.objectContaining({ kind: 'MANUAL_BANK_CLEARING', direction: 'CREDIT', amount: '500.00' }),
    ]);
    expect(repo.markPaid).toHaveBeenCalledWith(
      WD_ID,
      expect.objectContaining({ paidBy: ADMIN_ID, utr: 'UTR123456' }),
    );
  });

  it('cannot mark paid from PENDING (must be APPROVED first)', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'PENDING' }));
    await expect(
      inrWithdrawalService.markPaid(WD_ID, { utr: 'UTR123456' }, { actorId: ADMIN_ID }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE' });
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('is idempotent when already PAID (no double finalize)', async () => {
    repo.findById.mockResolvedValue(wd({ status: 'PAID', utr: 'UTR123456' }));
    const dto = await inrWithdrawalService.markPaid(WD_ID, { utr: 'UTR123456' }, { actorId: ADMIN_ID });
    expect(dto.status).toBe('PAID');
    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.markPaid).not.toHaveBeenCalled();
  });
});

describe('user reads (IDOR)', () => {
  it('returns 404 when the withdrawal is not the caller’s', async () => {
    repo.findByIdForUser.mockResolvedValue(null);
    await expect(
      inrWithdrawalService.getUserWithdrawal(USER_ID, WD_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.findByIdForUser).toHaveBeenCalledWith(WD_ID, USER_ID);
  });
});
