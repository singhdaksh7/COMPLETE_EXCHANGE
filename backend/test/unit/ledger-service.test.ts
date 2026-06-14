import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/ledger/ledger.repository', () => ({
  ledgerRepository: {
    tx: vi.fn(async (fn) => fn({})),
    findExistingPosting: vi.fn(),
    findOrCreateAccount: vi.fn(),
    ensureBalance: vi.fn(),
    creditBalance: vi.fn(),
    debitBalance: vi.fn(),
    createLedgerTransaction: vi.fn(),
    listWalletAccounts: vi.fn(),
    getWalletAccounts: vi.fn(),
    listLedgerEntries: vi.fn(),
    listInrTransactions: vi.fn(),
    projectionForAccount: vi.fn(),
    entriesBalanceForAccount: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { ledgerRepository } from '../../src/modules/ledger/ledger.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';

const repo = vi.mocked(ledgerRepository);

beforeEach(() => {
  vi.clearAllMocks();
  repo.findExistingPosting.mockResolvedValue(null);
  repo.findOrCreateAccount
    .mockResolvedValueOnce({
      id: 'acct-1',
      userId: 'user-1',
      asset: 'INR',
      kind: 'USER_AVAILABLE',
      createdAt: new Date(),
    })
    .mockResolvedValueOnce({
      id: 'acct-2',
      userId: 'user-1',
      asset: 'INR',
      kind: 'USER_LOCKED',
      createdAt: new Date(),
    });
  repo.ensureBalance.mockResolvedValue({} as never);
  repo.debitBalance.mockResolvedValue({ count: 1 });
  repo.creditBalance.mockResolvedValue({} as never);
  repo.createLedgerTransaction.mockResolvedValue({
    id: 'txn-1',
    kind: 'INTERNAL_TRANSFER',
    referenceType: 'test',
    referenceId: '11111111-1111-4111-8111-111111111111',
    entries: [
      {
        id: 1n,
        direction: 'DEBIT',
        amount: new Prisma.Decimal('10.00'),
        asset: 'INR',
      },
      {
        id: 2n,
        direction: 'CREDIT',
        amount: new Prisma.Decimal('10.00'),
        asset: 'INR',
      },
    ],
  } as never);
});

describe('ledgerService', () => {
  it('rejects unbalanced postings before touching the repository', async () => {
    await expect(
      ledgerService.post({
        kind: 'BAD',
        lines: [
          {
            userId: 'user-1',
            kind: 'USER_AVAILABLE',
            asset: 'INR',
            direction: 'DEBIT',
            amount: '10.00',
          },
          {
            userId: 'user-1',
            kind: 'USER_LOCKED',
            asset: 'INR',
            direction: 'CREDIT',
            amount: '9.99',
          },
        ],
      }),
    ).rejects.toMatchObject({ errorCode: 'BAD_REQUEST' });
    expect(repo.tx).not.toHaveBeenCalled();
  });

  it('posts a balanced internal transfer with projection updates', async () => {
    const result = await ledgerService.internalTransfer({
      userId: 'user-1',
      asset: 'INR',
      amount: '10.00',
      fromKind: 'USER_AVAILABLE',
      toKind: 'USER_LOCKED',
      referenceType: 'test',
      referenceId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.id).toBe('txn-1');
    expect(repo.debitBalance).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      new Prisma.Decimal('10.00'),
      false,
    );
    expect(repo.creditBalance).toHaveBeenCalledWith(
      expect.anything(),
      'acct-2',
      new Prisma.Decimal('10.00'),
    );
  });

  it('rejects internal transfer from system accounts', async () => {
    await expect(
      ledgerService.internalTransfer({
        userId: 'user-1',
        asset: 'INR',
        amount: '10.00',
        fromKind: 'GATEWAY_CLEARING',
        toKind: 'USER_AVAILABLE',
      }),
    ).rejects.toMatchObject({ errorCode: 'BAD_REQUEST' });
  });
});
