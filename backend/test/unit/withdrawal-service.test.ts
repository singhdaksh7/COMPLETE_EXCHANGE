import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/withdrawal/withdrawal.repository', () => ({
  withdrawalRepository: {
    findUserKyc: vi.fn(),
    getSupportedToken: vi.fn(),
    getWithdrawalFreeze: vi.fn(),
    getTierLimit: vi.fn(),
    sumTodayWithdrawals: vi.fn(),
    findActiveAddress: vi.fn(),
    addAddress: vi.fn(),
    listAddresses: vi.fn(),
    createWithdrawal: vi.fn(),
    findById: vi.fn(),
    setHold: vi.fn(),
    markRequestFailed: vi.fn(),
    firstApprove: vi.fn(),
    approveSmall: vi.fn(),
    secondApprove: vi.fn(),
    reject: vi.fn(),
    claimForBroadcast: vi.fn(),
    pickActiveHotWallet: vi.fn(),
    allocateNonce: vi.fn(),
    setBroadcast: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    setConfirming: vi.fn(),
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
import { withdrawalRepository } from '../../src/modules/withdrawal/withdrawal.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { withdrawalService } from '../../src/modules/withdrawal/withdrawal.service';
import { createMockWithdrawalSigner } from '../../src/modules/withdrawal/providers/withdrawal-signer.mock';

const repo = vi.mocked(withdrawalRepository);
const ledger = vi.mocked(ledgerService);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TO = `T${'A'.repeat(33)}`;

function withdrawal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wd-1',
    userId: USER_ID,
    chain: 'TRON',
    asset: 'USDT',
    toAddress: TO,
    fromAddress: null,
    amount: new Prisma.Decimal('10'),
    fee: new Prisma.Decimal('1'),
    netAmount: new Prisma.Decimal('9'),
    status: 'REQUESTED',
    holdTxnId: null,
    finalTxnId: null,
    txHash: null,
    nonce: null,
    requestedAt: new Date(),
    broadcastAt: null,
    completedAt: null,
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getWithdrawalFreeze.mockResolvedValue({ key: 'withdrawals_frozen', value: { enabled: false } } as never);
  repo.findUserKyc.mockResolvedValue({ id: USER_ID, status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1, withdrawalsBlocked: false, riskLevel: 'LOW' } as never);
  repo.getSupportedToken.mockResolvedValue({ asset: 'USDT', chain: 'TRON', contractAddr: 'TUSDT', decimals: 6, minConfirmations: 20, isActive: true } as never);
  repo.findActiveAddress.mockResolvedValue({ whitelistedAt: new Date(Date.now() - 1000) } as never);
  repo.getTierLimit.mockResolvedValue(null);
  ledger.post.mockResolvedValue({ id: 'ledger-txn', kind: 'X', entries: [] } as never);
});

describe('requestWithdrawal', () => {
  it('blocks when withdrawals are globally frozen', async () => {
    repo.getWithdrawalFreeze.mockResolvedValue({ value: { enabled: true } } as never);
    await expect(
      withdrawalService.requestWithdrawal(USER_ID, { toAddress: TO, amount: '10' }),
    ).rejects.toMatchObject({ errorCode: 'WITHDRAWALS_FROZEN' });
  });

  it('requires approved KYC', async () => {
    repo.findUserKyc.mockResolvedValue({ id: USER_ID, status: 'ACTIVE', kycStatus: 'PENDING', kycTier: 0, withdrawalsBlocked: false, riskLevel: 'LOW' } as never);
    await expect(
      withdrawalService.requestWithdrawal(USER_ID, { toAddress: TO, amount: '10' }),
    ).rejects.toMatchObject({ errorCode: 'KYC_REQUIRED' });
  });

  it('blocks user-level withdrawal requests when risk-blocked', async () => {
    repo.findUserKyc.mockResolvedValue({ id: USER_ID, status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1, withdrawalsBlocked: true, riskLevel: 'LOW' } as never);
    await expect(
      withdrawalService.requestWithdrawal(USER_ID, { toAddress: TO, amount: '10' }),
    ).rejects.toMatchObject({ errorCode: 'WITHDRAWALS_BLOCKED' });
    expect(repo.createWithdrawal).not.toHaveBeenCalled();
  });

  it('enforces the address allowlist', async () => {
    repo.findActiveAddress.mockResolvedValue(null);
    await expect(
      withdrawalService.requestWithdrawal(USER_ID, { toAddress: TO, amount: '10' }),
    ).rejects.toMatchObject({ errorCode: 'ADDRESS_NOT_ALLOWLISTED' });
  });

  it('rejects an amount below the configured minimum', async () => {
    await expect(
      withdrawalService.requestWithdrawal(USER_ID, { toAddress: TO, amount: '1' }),
    ).rejects.toMatchObject({ errorCode: 'MINIMUM_AMOUNT_NOT_MET' });
  });

  it('places a USER_AVAILABLE → USER_LOCKED hold on success', async () => {
    repo.createWithdrawal.mockResolvedValue(withdrawal());
    repo.setHold.mockResolvedValue(withdrawal({ status: 'PENDING_APPROVAL', holdTxnId: 'ledger-txn' }));

    const dto = await withdrawalService.requestWithdrawal(USER_ID, { toAddress: TO, amount: '10' });

    expect(dto.status).toBe('PENDING_APPROVAL');
    const posting = ledger.post.mock.calls[0][0];
    expect(posting.kind).toBe('WITHDRAWAL_HOLD');
    expect(posting.referenceType).toBe('crypto_withdrawal');
    expect(posting.referenceId).toBe('wd-1');
    expect(posting.lines).toEqual([
      expect.objectContaining({ kind: 'USER_AVAILABLE', direction: 'DEBIT', amount: '10' }),
      expect.objectContaining({ kind: 'USER_LOCKED', direction: 'CREDIT', amount: '10' }),
    ]);
    expect(repo.setHold).toHaveBeenCalledWith('wd-1', 'ledger-txn');
  });

  it('marks the request FAILED when the hold finds insufficient balance', async () => {
    repo.createWithdrawal.mockResolvedValue(withdrawal());
    ledger.post.mockRejectedValueOnce(
      new ConflictError('Insufficient balance for ledger debit', 'INSUFFICIENT_BALANCE'),
    );
    repo.markRequestFailed.mockResolvedValue(withdrawal({ status: 'FAILED' }));

    await expect(
      withdrawalService.requestWithdrawal(USER_ID, { toAddress: TO, amount: '10' }),
    ).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_BALANCE' });
    expect(repo.markRequestFailed).toHaveBeenCalledWith('wd-1', 'insufficient_balance');
  });
});

describe('admin approve/reject', () => {
  it('approves a pending withdrawal', async () => {
    repo.findById
      .mockResolvedValueOnce(withdrawal({ status: 'PENDING_APPROVAL', holdTxnId: 'h' }))
      .mockResolvedValueOnce(withdrawal({ status: 'APPROVED', holdTxnId: 'h' }));
    repo.approveSmall.mockResolvedValue({ count: 1 });

    const dto = await withdrawalService.approve('wd-1', { actorId: 'admin-1' });
    expect(dto.status).toBe('APPROVED');
    expect(repo.approveSmall).toHaveBeenCalledWith('wd-1', 'admin-1');
  });

  it('requires a second admin for large withdrawals', async () => {
    repo.findById
      .mockResolvedValueOnce(withdrawal({ status: 'PENDING_APPROVAL', amount: new Prisma.Decimal('1000'), holdTxnId: 'h' }))
      .mockResolvedValueOnce(withdrawal({ status: 'PENDING_APPROVAL', amount: new Prisma.Decimal('1000'), approvedBy: 'admin-1', holdTxnId: 'h' }));
    repo.firstApprove.mockResolvedValue({ count: 1 });

    const dto = await withdrawalService.approve('wd-1', { actorId: 'admin-1' });
    expect(dto.status).toBe('PENDING_APPROVAL');
    expect(repo.firstApprove).toHaveBeenCalledWith('wd-1', 'admin-1');
  });

  it('blocks the same admin from second approval', async () => {
    repo.findById.mockResolvedValueOnce(
      withdrawal({
        status: 'PENDING_APPROVAL',
        amount: new Prisma.Decimal('1000'),
        approvedBy: 'admin-1',
        holdTxnId: 'h',
      }),
    );

    await expect(
      withdrawalService.approve('wd-1', { actorId: 'admin-1' }),
    ).rejects.toMatchObject({ errorCode: 'DUAL_CONTROL_SAME_APPROVER' });
  });

  it('allows a different admin to complete second approval', async () => {
    repo.findById
      .mockResolvedValueOnce(
        withdrawal({
          status: 'PENDING_APPROVAL',
          amount: new Prisma.Decimal('1000'),
          approvedBy: 'admin-1',
          holdTxnId: 'h',
        }),
      )
      .mockResolvedValueOnce(
        withdrawal({
          status: 'APPROVED',
          amount: new Prisma.Decimal('1000'),
          approvedBy: 'admin-1',
          approvedBy2: 'admin-2',
          holdTxnId: 'h',
        }),
      );
    repo.secondApprove.mockResolvedValue({ count: 1 });

    const dto = await withdrawalService.approve('wd-1', { actorId: 'admin-2' });
    expect(dto.status).toBe('APPROVED');
    expect(repo.secondApprove).toHaveBeenCalledWith('wd-1', 'admin-1', 'admin-2');
  });

  it('reject releases the hold (USER_LOCKED → USER_AVAILABLE)', async () => {
    repo.findById
      .mockResolvedValueOnce(withdrawal({ status: 'PENDING_APPROVAL', holdTxnId: 'h' }))
      .mockResolvedValueOnce(withdrawal({ status: 'REJECTED', holdTxnId: 'h' }));
    repo.reject.mockResolvedValue({ count: 1 });

    const dto = await withdrawalService.reject('wd-1', 'not allowed', { actorId: 'admin-1' });
    expect(dto.status).toBe('REJECTED');
    const release = ledger.post.mock.calls[0][0];
    expect(release.kind).toBe('WITHDRAWAL_RELEASE');
    expect(release.referenceType).toBe('crypto_withdrawal_release');
    expect(release.lines).toEqual([
      expect.objectContaining({ kind: 'USER_LOCKED', direction: 'DEBIT', amount: '10' }),
      expect.objectContaining({ kind: 'USER_AVAILABLE', direction: 'CREDIT', amount: '10' }),
    ]);
  });
});

describe('broadcast + finalize', () => {
  it('claims, allocates a nonce, signs and broadcasts', async () => {
    repo.claimForBroadcast.mockResolvedValue({ count: 1 });
    repo.pickActiveHotWallet.mockResolvedValue({
      id: 'hw-1',
      address: 'Thotwallet',
      signer: { id: 's1', kmsKeyRef: 'kms://tron/1', publicKey: '0xpub' },
    } as never);
    repo.allocateNonce.mockResolvedValue(0n);
    repo.setBroadcast.mockResolvedValue(withdrawal({ status: 'BROADCAST' }));
    const signer = createMockWithdrawalSigner();

    const ok = await withdrawalService.broadcastWithdrawal(withdrawal({ status: 'APPROVED' }), signer);
    expect(ok).toBe(true);
    expect(repo.allocateNonce).toHaveBeenCalledWith('hw-1');
    const setArgs = repo.setBroadcast.mock.calls[0][1];
    expect(setArgs.nonce).toBe(0n);
    expect(setArgs.fromAddress).toBe('Thotwallet');
    expect(setArgs.txHash).toMatch(/^trxw_/);
  });

  it('does not broadcast when the claim fails (already claimed)', async () => {
    repo.claimForBroadcast.mockResolvedValue({ count: 0 });
    const signer = createMockWithdrawalSigner();
    const ok = await withdrawalService.broadcastWithdrawal(withdrawal({ status: 'SIGNING' }), signer);
    expect(ok).toBe(false);
    expect(repo.allocateNonce).not.toHaveBeenCalled();
  });

  it('finalizes through the ledger (USER_LOCKED → HOT_WALLET + FEE) exactly once', async () => {
    repo.markCompleted.mockResolvedValue({ count: 1 });
    const ok = await withdrawalService.finalizeWithdrawal(withdrawal({ status: 'CONFIRMING', txHash: 'trxw_x' }));
    expect(ok).toBe(true);
    const fin = ledger.post.mock.calls[0][0];
    expect(fin.kind).toBe('WITHDRAWAL_FINAL');
    expect(fin.referenceType).toBe('crypto_withdrawal_final');
    expect(fin.lines).toEqual([
      expect.objectContaining({ kind: 'USER_LOCKED', direction: 'DEBIT', amount: '10' }),
      expect.objectContaining({ kind: 'HOT_WALLET', direction: 'CREDIT', amount: '9' }),
      expect.objectContaining({ kind: 'FEE_REVENUE', direction: 'CREDIT', amount: '1' }),
    ]);
  });

  it('does not double-finalize when the conditional update affects 0 rows', async () => {
    repo.markCompleted.mockResolvedValue({ count: 0 });
    const ok = await withdrawalService.finalizeWithdrawal(withdrawal({ status: 'CONFIRMING', txHash: 'trxw_x' }));
    expect(ok).toBe(false);
  });

  it('failWithdrawal releases the hold', async () => {
    repo.markFailed.mockResolvedValue({ count: 1 });
    const ok = await withdrawalService.failWithdrawal(
      withdrawal({ status: 'BROADCAST', holdTxnId: 'h' }),
      'tx_failed',
    );
    expect(ok).toBe(true);
    const release = ledger.post.mock.calls[0][0];
    expect(release.kind).toBe('WITHDRAWAL_RELEASE');
  });
});
