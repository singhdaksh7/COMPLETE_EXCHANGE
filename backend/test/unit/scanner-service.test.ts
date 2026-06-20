import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockTronProvider } from '../../src/modules/scanner/providers/tron.mock';

vi.mock('../../src/modules/scanner/scanner.repository', () => ({
  scannerRepository: {
    getCursor: vi.fn(),
    getSupportedToken: vi.fn(),
    listActiveDepositAddresses: vi.fn(),
    getPendingDepositBlocks: vi.fn(),
    upsertDetectedDeposit: vi.fn(),
    orphanReorgedDeposits: vi.fn(),
    upsertCursor: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { scannerRepository } from '../../src/modules/scanner/scanner.repository';
import { scannerService } from '../../src/modules/scanner/scanner.service';

const repo = vi.mocked(scannerRepository);
const CONTRACT = 'TUSDTcontract';
const DEST = 'TdepositAddr';

beforeEach(() => {
  vi.clearAllMocks();
  repo.getCursor.mockResolvedValue(null);
  repo.getSupportedToken.mockResolvedValue({
    asset: 'USDT',
    chain: 'TRON',
    contractAddr: CONTRACT,
    decimals: 6,
    minConfirmations: 20,
    isActive: true,
  } as never);
  repo.listActiveDepositAddresses.mockResolvedValue([
    { id: 'addr-1', userId: 'user-1', address: DEST },
  ] as never);
  // No pending/confirming deposits already persisted in the scan window — the
  // service only needs to fetch the toBlock + transfer blocks.
  repo.getPendingDepositBlocks.mockResolvedValue([]);
  repo.upsertDetectedDeposit.mockResolvedValue({
    row: { id: 'dep-1' },
    created: true,
  } as never);
  repo.orphanReorgedDeposits.mockResolvedValue({ count: 0 });
  repo.upsertCursor.mockResolvedValue({} as never);
});

describe('scannerService.scanOnce (detection)', () => {
  it('detects USDT transfers to known deposit addresses and advances the cursor', async () => {
    const provider = createMockTronProvider({ head: 5n });
    provider.addTransfer({
      txHash: 'txKnown',
      logIndex: 0,
      from: 'Tsender',
      to: DEST,
      contract: CONTRACT,
      amountBase: '2000000', // 2.0 USDT @ 6dp
      blockNumber: 2n,
    });
    // A transfer to an address we don't own — must be ignored.
    provider.addTransfer({
      txHash: 'txForeign',
      logIndex: 0,
      from: 'Tsender',
      to: 'TsomeoneElse',
      contract: CONTRACT,
      amountBase: '9999',
      blockNumber: 3n,
    });

    const result = await scannerService.scanOnce({ provider });

    expect(repo.upsertDetectedDeposit).toHaveBeenCalledTimes(1);
    const arg = repo.upsertDetectedDeposit.mock.calls[0][0];
    expect(arg.chain).toBe('TRON');
    expect(arg.asset).toBe('USDT');
    expect(arg.txHash).toBe('txKnown');
    expect(arg.blockNumber).toBe(2n);
    expect(arg.amount.toString()).toBe('2'); // human, exact decimal
    expect(arg.amountBase.toString()).toBe('2000000');
    expect(arg.reqConfirmations).toBe(20);
    expect(arg.userId).toBe('user-1');
    expect(arg.addressId).toBe('addr-1');

    // head 5 - safetyLag 1 = 4
    expect(repo.upsertCursor).toHaveBeenCalledWith('TRON', {
      lastScannedBlock: 4n,
      lastScannedHash: 'tron_block_4',
      safeBlock: 4n,
    });
    expect(result.detected).toBe(1);
  });

  it('does nothing when the chain head is below the start block', async () => {
    const provider = createMockTronProvider({ head: 0n });
    const result = await scannerService.scanOnce({ provider });
    expect(result.detected).toBe(0);
    expect(repo.upsertDetectedDeposit).not.toHaveBeenCalled();
    expect(repo.upsertCursor).not.toHaveBeenCalled();
  });

  it('resumes from the persisted cursor on the next pass', async () => {
    repo.getCursor.mockResolvedValue({
      chain: 'TRON',
      lastScannedBlock: 100n,
      lastScannedHash: 'tron_block_100',
      safeBlock: 100n,
      updatedAt: new Date(),
    } as never);
    const provider = createMockTronProvider({ head: 140n });

    const result = await scannerService.scanOnce({ provider });

    // toBlock = 140 - 1 = 139; cursor advances there regardless of detections.
    expect(repo.upsertCursor).toHaveBeenCalledWith(
      'TRON',
      expect.objectContaining({ lastScannedBlock: 139n, safeBlock: 139n }),
    );
    expect(result.toBlock).toBe('139');
  });

  it('does NOT advance the cursor when the provider head fetch fails', async () => {
    const provider = createMockTronProvider({ head: 5n });
    provider.getLatestBlock = vi.fn().mockRejectedValue(new Error('rpc unavailable'));

    await expect(scannerService.scanOnce({ provider })).rejects.toThrow('rpc unavailable');
    expect(repo.upsertCursor).not.toHaveBeenCalled();
    expect(repo.upsertDetectedDeposit).not.toHaveBeenCalled();
  });
});

describe('scannerService.statusSummary', () => {
  it('summarizes chains + checkpoints without exposing any secrets', async () => {
    repo.getCursor.mockImplementation(async (chain: string) =>
      chain === 'TRON'
        ? ({
            chain: 'TRON',
            lastScannedBlock: 1234n,
            lastScannedHash: 'tron_block_1234',
            safeBlock: 1234n,
            updatedAt: new Date('2026-06-20T00:00:00Z'),
          } as never)
        : null,
    );

    const summary = await scannerService.statusSummary();

    expect(summary.chains.map((c) => c.chain)).toEqual(['TRON', 'BSC']);
    const tron = summary.chains.find((c) => c.chain === 'TRON')!;
    expect(tron.lastScannedBlock).toBe('1234');
    expect(tron.safeBlock).toBe('1234');
    expect(['mock', 'live']).toContain(tron.providerMode);

    // A chain with no cursor reports nulls rather than throwing.
    const bsc = summary.chains.find((c) => c.chain === 'BSC')!;
    expect(bsc.lastScannedBlock).toBeNull();

    expect(typeof summary.safetyLag).toBe('number');
    expect(typeof summary.reorgBuffer).toBe('number');

    // Secrets-free invariant: no RPC URL / api key / private key anywhere.
    const serialized = JSON.stringify(summary).toLowerCase();
    expect(serialized).not.toContain('http');
    expect(serialized).not.toContain('apikey');
    expect(serialized).not.toContain('rpc');
    expect(serialized).not.toContain('key');
  });
});
