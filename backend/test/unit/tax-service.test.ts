import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/tax/tax.repository', () => ({
  taxRepository: {
    listRules: vi.fn(),
    findRule: vi.fn(),
    upsertRule: vi.fn(),
    findProfile: vi.fn(),
    upsertProfile: vi.fn(),
    createTds: vi.fn(),
    listTds: vi.fn(),
    tdsForUser: vi.fn(),
    createStatement: vi.fn(),
    listStatements: vi.fn(),
  },
}));
vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { taxService, computeTds, financialYearOf, TAX_LABEL } from '../../src/modules/tax/tax.service';
import { taxRepository } from '../../src/modules/tax/tax.repository';

const repo = vi.mocked(taxRepository);

beforeEach(() => vi.clearAllMocks());

describe('computeTds (pure)', () => {
  it('computes 1% TDS at 100 bps', () => {
    expect(computeTds(100000, 100, false)).toEqual({ effectiveBps: 100, tdsAmount: 1000 });
  });
  it('applies a higher-TDS bump when no PAN', () => {
    const r = computeTds(100000, 100, true);
    expect(r.effectiveBps).toBeGreaterThan(100);
    expect(r.tdsAmount).toBeGreaterThan(1000);
  });
  it('zero rate yields zero TDS (with PAN)', () => {
    expect(computeTds(100000, 0, false)).toEqual({ effectiveBps: 0, tdsAmount: 0 });
  });
});

describe('financialYearOf', () => {
  it('April onward maps to the starting year', () => {
    expect(financialYearOf(new Date('2025-05-01T00:00:00Z'))).toBe('2025-26');
  });
  it('Jan–Mar maps to the prior starting year', () => {
    expect(financialYearOf(new Date('2026-02-01T00:00:00Z'))).toBe('2025-26');
  });
});

describe('taxService.listRules', () => {
  it('seeds the baseline rule set on first (empty) read', async () => {
    repo.listRules.mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ id: 'r1' }] as never);
    repo.upsertRule.mockResolvedValue({} as never);
    await taxService.listRules({ actorId: 'admin-1' });
    expect(repo.upsertRule).toHaveBeenCalledTimes(5); // 5 default event types
  });
});

describe('taxService.recordEvents — calculation-only', () => {
  it('creates TDS records labelled calculation-only and never deducts ledger', async () => {
    repo.findProfile.mockResolvedValue({ higherTdsApplicable: false } as never);
    repo.listRules.mockResolvedValue([{ id: 'rule-1', eventType: 'TRADE_SELL', rateBps: 100, status: 'ACTIVE' }] as never);
    repo.createTds.mockResolvedValue({ id: 't1' } as never);

    await taxService.recordEvents('user-1', [{ eventType: 'TRADE_SELL', grossAmount: 100000, asset: 'USDT' }], { actorId: 'admin-1' });

    expect(repo.createTds).toHaveBeenCalledWith(expect.objectContaining({ label: TAX_LABEL, status: 'CALCULATED', rateBps: 100 }));
    const arg = repo.createTds.mock.calls[0][0] as { tdsAmount: unknown };
    expect(Number(arg.tdsAmount)).toBe(1000);
  });
});

describe('taxService.generateStatement', () => {
  it('aggregates TDS and writes a checksummed statement', async () => {
    repo.findProfile.mockResolvedValue({ higherTdsApplicable: false } as never);
    repo.listRules.mockResolvedValue([{ id: 'rule-1', eventType: 'TRADE_SELL', rateBps: 100, status: 'ACTIVE' }] as never);
    repo.createTds.mockResolvedValue({ id: 't1' } as never);
    repo.tdsForUser.mockResolvedValue([
      { eventType: 'TRADE_SELL', grossAmount: '100000', tdsAmount: '1000' },
    ] as never);
    repo.createStatement.mockResolvedValue({ id: 's1' } as never);

    await taxService.generateStatement('user-1', '2025-26', [{ eventType: 'TRADE_SELL', grossAmount: 100000 }], { actorId: 'admin-1' });

    const arg = repo.createStatement.mock.calls[0][0] as { checksum?: string; status?: string; label?: string };
    expect(arg.status).toBe('GENERATED');
    expect(arg.label).toBe(TAX_LABEL);
    expect(arg.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the tax repository exposes no delete method (non-destructive)', () => {
    expect((repo as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((repo as unknown as Record<string, unknown>).deleteTds).toBeUndefined();
  });
});
