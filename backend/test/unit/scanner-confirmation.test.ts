import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { createMockTronProvider } from '../../src/modules/scanner/providers/tron.mock';

vi.mock('../../src/modules/scanner/scanner.repository', () => ({
  scannerRepository: {
    listCreditableCandidates: vi.fn(),
    updateConfirmations: vi.fn(),
    markCredited: vi.fn(),
  },
}));

vi.mock('../../src/modules/ledger/ledger.service', () => ({
  ledgerService: { post: vi.fn() },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

// Notifications are a fire-and-forget side effect; stub them in the unit test.
vi.mock('../../src/modules/notification/notification.service', () => ({
  notificationService: { notifyUser: vi.fn(), notifyAdmins: vi.fn() },
}));

import { scannerRepository } from '../../src/modules/scanner/scanner.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { confirmationService } from '../../src/modules/scanner/confirmation.service';

const repo = vi.mocked(scannerRepository);
const ledger = vi.mocked(ledgerService);

const USER_ID = '11111111-1111-4111-8111-111111111111';

function deposit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dep-1',
    userId: USER_ID,
    addressId: 'addr-1',
    chain: 'TRON',
    asset: 'USDT',
    txHash: 'txA',
    logIndex: 0,
    fromAddress: 'Tfrom',
    amountBase: new Prisma.Decimal('1500000'),
    amount: new Prisma.Decimal('1.5'),
    confirmations: 0,
    reqConfirmations: 20,
    status: 'DETECTED',
    blockNumber: 10n,
    blockHash: 'tron_block_10',
    creditedTxnId: null,
    detectedAt: new Date(),
    creditedAt: null,
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.updateConfirmations.mockResolvedValue({} as never);
  ledger.post.mockResolvedValue({ id: 'ltxn-1', kind: 'DEPOSIT_CREDIT', entries: [] } as never);
  repo.markCredited.mockResolvedValue({ count: 1 });
});

describe('confirmationService.runConfirmations', () => {
  it('promotes to CONFIRMING below threshold and does not credit', async () => {
    const provider = createMockTronProvider({ head: 12n }); // depth = 12-10+1 = 3
    repo.listCreditableCandidates.mockResolvedValue([deposit({ status: 'DETECTED' })]);

    const result = await confirmationService.runConfirmations({ provider });

    expect(repo.updateConfirmations).toHaveBeenCalledWith('dep-1', {
      confirmations: 3,
      status: 'CONFIRMING',
    });
    expect(ledger.post).not.toHaveBeenCalled();
    expect(result.credited).toBe(0);
  });

  it('promotes to CONFIRMED and credits once min-confirmations is reached', async () => {
    const provider = createMockTronProvider({ head: 100n }); // depth = 91 >= 20
    repo.listCreditableCandidates.mockResolvedValue([deposit({ status: 'CONFIRMING' })]);

    const result = await confirmationService.runConfirmations({ provider });

    expect(ledger.post).toHaveBeenCalledOnce();
    const posting = ledger.post.mock.calls[0][0];
    expect(posting.kind).toBe('DEPOSIT_CREDIT');
    expect(posting.referenceType).toBe('crypto_deposit');
    expect(posting.referenceId).toBe('dep-1');
    expect(posting.lines).toEqual([
      expect.objectContaining({
        kind: 'SWEEP_CLEARING',
        direction: 'DEBIT',
        asset: 'USDT',
        amount: '1.5',
        userId: null,
      }),
      expect.objectContaining({
        kind: 'USER_AVAILABLE',
        direction: 'CREDIT',
        asset: 'USDT',
        amount: '1.5',
        userId: USER_ID,
      }),
    ]);
    expect(repo.markCredited).toHaveBeenCalledWith('dep-1', 'ltxn-1');
    expect(result.credited).toBe(1);
  });
});

describe('confirmationService.creditDeposit idempotency', () => {
  it('does not double-credit when the conditional update affects 0 rows', async () => {
    repo.markCredited.mockResolvedValue({ count: 0 }); // already credited by a peer
    const did = await confirmationService.creditDeposit(deposit({ status: 'CONFIRMED' }));
    expect(did).toBe(false);
    // Ledger.post is still idempotent on (referenceType, referenceId), so calling
    // it is safe; the conditional markCredited is what prevents a double count.
    expect(repo.markCredited).toHaveBeenCalled();
  });

  it('skips an already-CREDITED deposit without posting to the ledger', async () => {
    const did = await confirmationService.creditDeposit(deposit({ status: 'CREDITED' }));
    expect(did).toBe(false);
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('never auto-credits a deposit with no resolved user', async () => {
    const did = await confirmationService.creditDeposit(
      deposit({ status: 'CONFIRMED', userId: null }),
    );
    expect(did).toBe(false);
    expect(ledger.post).not.toHaveBeenCalled();
  });
});
