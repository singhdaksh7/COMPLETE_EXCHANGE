import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/compliance/wallet-risk.repository', () => ({
  walletRiskRepository: {
    upsertTransfer: vi.fn(),
    findTransfer: vi.fn(),
    updateTransfer: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  travelRuleService,
  nextStatusForAction,
  isTravelRuleRequired,
} from '../../src/modules/compliance/travel-rule.service';
import { walletRiskRepository } from '../../src/modules/compliance/wallet-risk.repository';

const repo = vi.mocked(walletRiskRepository);

beforeEach(() => vi.clearAllMocks());

describe('nextStatusForAction (pure transitions)', () => {
  it('REQUIRED -> COLLECTED -> READY', () => {
    expect(nextStatusForAction('REQUIRED', 'COLLECTED')).toBe('READY');
  });
  it('REQUIRED -> REQUEST_INFO -> PENDING_INFO', () => {
    expect(nextStatusForAction('REQUIRED', 'REQUEST_INFO')).toBe('PENDING_INFO');
  });
  it('PENDING_INFO -> COLLECTED -> READY', () => {
    expect(nextStatusForAction('PENDING_INFO', 'COLLECTED')).toBe('READY');
  });
  it('READY -> SENT_MOCK -> SENT_MOCK', () => {
    expect(nextStatusForAction('READY', 'SENT_MOCK')).toBe('SENT_MOCK');
  });
  it('any non-terminal -> EXEMPTED', () => {
    expect(nextStatusForAction('REQUIRED', 'EXEMPTED')).toBe('EXEMPTED');
    expect(nextStatusForAction('PENDING_INFO', 'EXEMPTED')).toBe('EXEMPTED');
  });
  it('invalid transitions return null', () => {
    expect(nextStatusForAction('NOT_REQUIRED', 'SENT_MOCK')).toBeNull();
    expect(nextStatusForAction('REQUIRED', 'SENT_MOCK')).toBeNull(); // must be READY first
    expect(nextStatusForAction('SENT_MOCK', 'EXEMPTED')).toBeNull(); // terminal
    expect(nextStatusForAction('EXEMPTED', 'COLLECTED')).toBeNull(); // terminal
  });
});

describe('isTravelRuleRequired', () => {
  it('is required at/above the threshold', () => {
    expect(isTravelRuleRequired(1000, 1000)).toBe(true);
    expect(isTravelRuleRequired(5000, 1000)).toBe(true);
  });
  it('is not required below the threshold', () => {
    expect(isTravelRuleRequired(999, 1000)).toBe(false);
  });
});

describe('travelRuleService.record', () => {
  it('marks an over-threshold transfer REQUIRED', async () => {
    repo.upsertTransfer.mockResolvedValue({ transfer: { id: 't1', status: 'REQUIRED' }, created: true } as never);
    await travelRuleService.record({ direction: 'OUTBOUND', chain: 'ETH', asset: 'USDT', amount: 5000, withdrawalId: 'w1' });
    const arg = repo.upsertTransfer.mock.calls[0][0] as { status: string };
    expect(arg.status).toBe('REQUIRED');
  });

  it('marks a small transfer NOT_REQUIRED', async () => {
    repo.upsertTransfer.mockResolvedValue({ transfer: { id: 't2', status: 'NOT_REQUIRED' }, created: true } as never);
    await travelRuleService.record({ direction: 'OUTBOUND', chain: 'ETH', asset: 'USDT', amount: 10, withdrawalId: 'w2' });
    const arg = repo.upsertTransfer.mock.calls[0][0] as { status: string };
    expect(arg.status).toBe('NOT_REQUIRED');
  });
});

describe('travelRuleService.applyAction', () => {
  it('COLLECTED on a REQUIRED transfer moves it to READY and stamps infoCollectedAt', async () => {
    repo.findTransfer.mockResolvedValue({ id: 't1', status: 'REQUIRED', counterparty: null } as never);
    repo.updateTransfer.mockResolvedValue({ id: 't1', status: 'READY' } as never);

    await travelRuleService.applyAction('t1', 'COLLECTED', {}, { actorId: 'admin-1' });

    const data = repo.updateTransfer.mock.calls[0][1] as { status: string; infoCollectedAt?: Date };
    expect(data.status).toBe('READY');
    expect(data.infoCollectedAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid transition (SENT_MOCK from REQUIRED)', async () => {
    repo.findTransfer.mockResolvedValue({ id: 't1', status: 'REQUIRED', counterparty: null } as never);
    await expect(travelRuleService.applyAction('t1', 'SENT_MOCK', {}, {})).rejects.toThrow(/Cannot SENT_MOCK/);
  });

  it('SENT_MOCK on a READY transfer stamps sentMockAt', async () => {
    repo.findTransfer.mockResolvedValue({ id: 't1', status: 'READY', counterparty: null } as never);
    repo.updateTransfer.mockResolvedValue({ id: 't1', status: 'SENT_MOCK' } as never);

    await travelRuleService.applyAction('t1', 'SENT_MOCK', {}, { actorId: 'admin-1' });

    const data = repo.updateTransfer.mock.calls[0][1] as { status: string; sentMockAt?: Date };
    expect(data.status).toBe('SENT_MOCK');
    expect(data.sentMockAt).toBeInstanceOf(Date);
  });
});

describe('travelRuleService.exportMockPacket', () => {
  it('is clearly marked mock-only and never claims transmission', async () => {
    repo.findTransfer.mockResolvedValue({ id: 't1', status: 'SENT_MOCK', direction: 'OUTBOUND', chain: 'ETH', asset: 'USDT', amount: '5000', thresholdAmount: '1000', counterparty: null, counterpartyAddress: '0xabc', createdAt: new Date() } as never);
    const packet = await travelRuleService.exportMockPacket('t1', { actorId: 'admin-1' });
    expect(packet.exportType).toBe('TRAVEL_RULE_MOCK_ONLY');
    expect(packet.disclaimer).toMatch(/NOT transmitted to any VASP/i);
  });
});
