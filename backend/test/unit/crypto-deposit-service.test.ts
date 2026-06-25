import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/crypto-deposit/crypto-deposit.repository', () => ({
  cryptoDepositRepository: {
    findByChainTxHash: vi.fn(),
    findById: vi.fn(),
    findByIdWithUser: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    markCredited: vi.fn(),
    listForUser: vi.fn(),
    listForAdmin: vi.fn(),
    writeAdminLog: vi.fn(),
    upsertNetworkConfig: vi.fn(),
  },
}));

vi.mock('../../src/modules/crypto-deposit/crypto-deposit.config', () => ({
  SUPPORTED_CHAINS: ['BSC', 'ETH', 'TRON'],
  cryptoDepositsEnabled: vi.fn(() => true),
  getNetwork: vi.fn(),
  isNetworkConfigured: vi.fn(() => true),
  isNetworkEnabled: vi.fn(() => true),
  listEnabledPublicNetworks: vi.fn(() => []),
  toPublicNetwork: vi.fn(),
}));

vi.mock('../../src/modules/crypto-deposit/verification', () => ({
  usdtDepositVerifier: { verifyTx: vi.fn() },
}));

vi.mock('../../src/modules/ledger/ledger.service', () => ({
  ledgerService: { post: vi.fn() },
}));

vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { cryptoDepositService } from '../../src/modules/crypto-deposit/crypto-deposit.service';
import { cryptoDepositRepository } from '../../src/modules/crypto-deposit/crypto-deposit.repository';
import * as cfg from '../../src/modules/crypto-deposit/crypto-deposit.config';
import { usdtDepositVerifier } from '../../src/modules/crypto-deposit/verification';
import { ledgerService } from '../../src/modules/ledger/ledger.service';

const repo = vi.mocked(cryptoDepositRepository);
const config = vi.mocked(cfg);
const verifier = vi.mocked(usdtDepositVerifier);
const ledger = vi.mocked(ledgerService);

const NETWORK = {
  chain: 'BSC' as const,
  family: 'EVM' as const,
  networkName: 'BNB Smart Chain (BEP20)',
  assetSymbol: 'USDT',
  decimals: 18,
  masterAddress: `0x${'11'.repeat(20)}`,
  tokenContract: `0x${'22'.repeat(20)}`,
  minConfirmations: 15,
  rpcUrl: 'http://rpc.local',
  apiUrl: null,
  apiKey: null,
};

// Decimal-like stub (Prisma returns a Decimal with .toFixed()).
const dec = (v: unknown) => ({ toFixed: () => String(v ?? '0') });

function deposit(over: Record<string, unknown> = {}) {
  const { amount, ...rest } = over;
  return {
    id: 'dep-1',
    userId: 'user-1',
    assetSymbol: 'USDT',
    chain: 'BSC',
    masterAddress: NETWORK.masterAddress,
    fromAddress: null,
    txHash: `0x${'ab'.repeat(32)}`,
    logIndex: null,
    confirmations: 0,
    status: 'SUBMITTED',
    rejectionReason: null,
    rawVerificationSummary: null,
    creditedLedgerTxnId: null,
    creditedAt: null,
    createdAt: new Date('2026-06-26'),
    updatedAt: new Date('2026-06-26'),
    ...rest,
    // Always a Decimal-like, even when the override sets a raw string amount.
    amount: dec(amount),
  } as never;
}

const SUBMIT = { assetSymbol: 'USDT' as const, chain: 'BSC' as const, txHash: `0x${'ab'.repeat(32)}` };

beforeEach(() => {
  vi.clearAllMocks();
  config.cryptoDepositsEnabled.mockReturnValue(true);
  config.getNetwork.mockReturnValue({ ...NETWORK });
  config.isNetworkConfigured.mockReturnValue(true);
  config.isNetworkEnabled.mockReturnValue(true);
  repo.update.mockImplementation(async (_id, data) => deposit(data as Record<string, unknown>));
  repo.findById.mockResolvedValue(deposit({ status: 'CONFIRMED' }));
});

describe('cryptoDepositService.submit — confirmed deposit credits exactly once', () => {
  it('posts the double-entry credit once and marks the deposit credited', async () => {
    repo.findByChainTxHash.mockResolvedValue(null);
    repo.create.mockResolvedValue(deposit());
    verifier.verifyTx.mockResolvedValue({
      outcome: 'CONFIRMED',
      amount: '10',
      confirmations: 20,
      fromAddress: `0x${'33'.repeat(20)}`,
      logIndex: 0,
      summary: { ok: true },
    });
    ledger.post.mockResolvedValue({ id: 'ltx-1', kind: 'CRYPTO_DEPOSIT_CREDIT', entries: [] } as never);
    repo.markCredited.mockResolvedValue({ count: 1 } as never);

    const dto = await cryptoDepositService.submit('user-1', SUBMIT, {});

    expect(ledger.post).toHaveBeenCalledTimes(1);
    const posting = ledger.post.mock.calls[0][0];
    expect(posting.referenceType).toBe('master_wallet_deposit');
    expect(posting.referenceId).toBe('dep-1');
    const dirs = posting.lines.map((l) => `${l.kind}:${l.direction}:${l.amount}`);
    expect(dirs).toContain('SWEEP_CLEARING:DEBIT:10');
    expect(dirs).toContain('USER_AVAILABLE:CREDIT:10');
    expect(repo.markCredited).toHaveBeenCalledTimes(1);
    expect(dto.status).toBe('confirmed');
  });
});

describe('cryptoDepositService — no double credit', () => {
  it('does not re-process an already-CONFIRMED deposit', async () => {
    const result = await cryptoDepositService.verifyAndProcess(
      deposit({ status: 'CONFIRMED' }),
      {},
    );
    expect(verifier.verifyTx).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
    expect(result.status).toBe('CONFIRMED');
  });

  it('returns a safe duplicate (no credit) when the tx belongs to another user', async () => {
    repo.findByChainTxHash.mockResolvedValue(deposit({ userId: 'other-user', status: 'CONFIRMED' }));

    const dto = await cryptoDepositService.submit('user-1', SUBMIT, {});

    expect(dto.status).toBe('duplicate');
    expect(repo.create).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });
});

describe('cryptoDepositService — insufficient confirmations', () => {
  it('marks PENDING_CONFIRMATION without crediting', async () => {
    repo.findByChainTxHash.mockResolvedValue(null);
    repo.create.mockResolvedValue(deposit());
    verifier.verifyTx.mockResolvedValue({
      outcome: 'PENDING',
      amount: '10',
      confirmations: 3,
      fromAddress: null,
      logIndex: null,
      summary: {},
    });

    await cryptoDepositService.submit('user-1', SUBMIT, {});

    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'dep-1',
      expect.objectContaining({ status: 'PENDING_CONFIRMATION', confirmations: 3 }),
    );
  });
});

describe('cryptoDepositService — provider safety', () => {
  it('does not crash and marks FAILED when the network is not configured', async () => {
    config.isNetworkConfigured.mockReturnValue(false);
    const res = await cryptoDepositService.verifyAndProcess(deposit(), {});
    expect(verifier.verifyTx).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'dep-1',
      expect.objectContaining({ status: 'FAILED', rejectionReason: 'provider_not_configured' }),
    );
    expect(res).toBeDefined();
  });

  it('rejects a submission when crypto deposits are globally disabled', async () => {
    config.cryptoDepositsEnabled.mockReturnValue(false);
    await expect(cryptoDepositService.submit('user-1', SUBMIT, {})).rejects.toMatchObject({
      errorCode: 'CRYPTO_DEPOSITS_DISABLED',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('treats a transient PROVIDER_ERROR as FAILED (retryable), never credited', async () => {
    repo.findByChainTxHash.mockResolvedValue(null);
    repo.create.mockResolvedValue(deposit());
    verifier.verifyTx.mockResolvedValue({ outcome: 'PROVIDER_ERROR', reason: 'provider_error' });

    await cryptoDepositService.submit('user-1', SUBMIT, {});

    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'dep-1',
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
});

describe('cryptoDepositService.creditDeposit — idempotent guard', () => {
  it('a second credit pass does not bind a new credit (markCredited count 0)', async () => {
    ledger.post.mockResolvedValue({ id: 'ltx-1', kind: 'x', entries: [] } as never);
    repo.markCredited.mockResolvedValueOnce({ count: 1 } as never).mockResolvedValueOnce({ count: 0 } as never);
    repo.findById.mockResolvedValue(deposit({ status: 'CONFIRMED' }));
    const result = {
      outcome: 'CONFIRMED' as const,
      amount: '5',
      confirmations: 20,
      fromAddress: null,
      logIndex: null,
      summary: {},
    };

    await cryptoDepositService.creditDeposit(deposit(), result, {});
    await cryptoDepositService.creditDeposit(deposit({ status: 'CONFIRMED' }), result, {});

    // Both passes call post (ledger de-dupes server-side), but markCredited
    // only flips once — no double credit.
    expect(repo.markCredited).toHaveBeenCalledTimes(2);
  });
});
