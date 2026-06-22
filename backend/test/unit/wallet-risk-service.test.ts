import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Service-level tests for the Stage 5.3 wallet-risk service. The repositories and
 * audit are mocked; the REAL deterministic mock provider is used (resolved via
 * config), so address substrings drive the outcome without a database.
 */

vi.mock('../../src/modules/compliance/wallet-risk.repository', () => ({
  walletRiskRepository: {
    findProfile: vi.fn(),
    upsertProfile: vi.fn(),
    updateProfile: vi.fn(),
    upsertCheck: vi.fn(),
    updateCheck: vi.fn(),
    findCheck: vi.fn(),
    createEvent: vi.fn(),
  },
}));

vi.mock('../../src/modules/compliance/monitoring.repository', () => ({
  monitoringRepository: {
    upsertAlert: vi.fn(),
    findCaseByDedupe: vi.fn(),
    createCase: vi.fn(),
    updateAlert: vi.fn(),
    createEvent: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  walletRiskService,
  evaluateWithdrawalCompliance,
} from '../../src/modules/compliance/wallet-risk.service';
import { walletRiskRepository } from '../../src/modules/compliance/wallet-risk.repository';
import { monitoringRepository } from '../../src/modules/compliance/monitoring.repository';

const repo = vi.mocked(walletRiskRepository);
const mon = vi.mocked(monitoringRepository);

beforeEach(() => {
  vi.clearAllMocks();
  repo.findProfile.mockResolvedValue(null);
  repo.upsertProfile.mockResolvedValue({ id: 'prof-1', overriddenLevel: null } as never);
  repo.updateProfile.mockResolvedValue({} as never);
  repo.createEvent.mockResolvedValue({} as never);
  repo.updateCheck.mockResolvedValue({} as never);
});

describe('walletRiskService.runCheck', () => {
  it('a clean address persists a LOW/CLEAR check and raises no alert', async () => {
    repo.upsertCheck.mockResolvedValue({ check: { id: 'c1', profileId: 'prof-1', level: 'LOW', status: 'CLEAR', score: 5 }, created: true } as never);

    const res = await walletRiskService.runCheck({ chain: 'ETH', address: '0xclean', userId: 'user-1' });

    expect(res.check.level).toBe('LOW');
    expect(mon.upsertAlert).not.toHaveBeenCalled();
    expect(mon.createCase).not.toHaveBeenCalled();
  });

  it('a CRITICAL/blocked address raises an alert AND auto-opens a WALLET_RISK case', async () => {
    repo.upsertCheck.mockResolvedValue({ check: { id: 'c2', profileId: 'prof-1', level: 'CRITICAL', status: 'BLOCKED', score: 95, summary: 'blocked' }, created: true } as never);
    mon.upsertAlert.mockResolvedValue({ alert: { id: 'a2', caseId: null }, created: true } as never);
    mon.findCaseByDedupe.mockResolvedValue(null);
    mon.createCase.mockResolvedValue({ id: 'case-2' } as never);

    await walletRiskService.runCheck({ chain: 'ETH', address: '0xblocked', userId: 'user-1' });

    expect(mon.upsertAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'WALLET_RISK_ACTIVITY', priority: 'CRITICAL' }));
    expect(mon.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: 'WALLET_RISK', priority: 'CRITICAL' }));
    expect(mon.updateAlert).toHaveBeenCalledWith('a2', expect.objectContaining({ caseId: 'case-2', status: 'LINKED_TO_CASE' }));
  });

  it('a HIGH address raises an alert but does NOT open a case', async () => {
    repo.upsertCheck.mockResolvedValue({ check: { id: 'c3', profileId: 'prof-1', level: 'HIGH', status: 'REVIEW_REQUIRED', score: 75, summary: 'risky' }, created: true } as never);
    mon.upsertAlert.mockResolvedValue({ alert: { id: 'a3', caseId: null }, created: true } as never);

    await walletRiskService.runCheck({ chain: 'ETH', address: '0xhighrisk', userId: 'user-1' });

    expect(mon.upsertAlert).toHaveBeenCalledWith(expect.objectContaining({ priority: 'HIGH' }));
    expect(mon.createCase).not.toHaveBeenCalled();
  });

  it('does NOT raise an alert for a HIGH address with no known user', async () => {
    repo.upsertCheck.mockResolvedValue({ check: { id: 'c4', profileId: 'prof-1', level: 'HIGH', status: 'REVIEW_REQUIRED', score: 75 }, created: true } as never);

    await walletRiskService.runCheck({ chain: 'ETH', address: '0xhighrisk' });

    expect(mon.upsertAlert).not.toHaveBeenCalled();
  });

  it('is idempotent: a duplicate check (created:false) raises no new alert/case', async () => {
    repo.upsertCheck.mockResolvedValue({ check: { id: 'c2', profileId: 'prof-1', level: 'CRITICAL', status: 'BLOCKED', score: 95 }, created: false } as never);

    const res = await walletRiskService.runCheck({ chain: 'ETH', address: '0xblocked', userId: 'user-1' });

    expect(res.created).toBe(false);
    expect(mon.upsertAlert).not.toHaveBeenCalled();
    expect(mon.createCase).not.toHaveBeenCalled();
  });

  it("a provider failure ('fail' address) is recorded as a FAILED check, not thrown", async () => {
    repo.upsertCheck.mockResolvedValue({ check: { id: 'c5', profileId: 'prof-1', level: 'MEDIUM', status: 'FAILED', score: 0 }, created: true } as never);

    const res = await walletRiskService.runCheck({ chain: 'ETH', address: '0xfailnow', userId: 'user-1' });

    // upsertCheck was called with a FAILED status (provider threw internally).
    const arg = repo.upsertCheck.mock.calls[0][0] as { status: string };
    expect(arg.status).toBe('FAILED');
    expect(res.check).toBeTruthy();
    expect(mon.upsertAlert).not.toHaveBeenCalled();
  });
});

describe('walletRiskService.review', () => {
  it('records a decision, pins the profile level, and writes an event', async () => {
    repo.findCheck.mockResolvedValue({ id: 'c1', profileId: 'prof-1' } as never);

    await walletRiskService.review('c1', { decision: 'CLEAR', level: 'LOW', note: 'false positive' }, { actorId: 'admin-1' });

    expect(repo.updateCheck).toHaveBeenCalledWith('c1', expect.objectContaining({ reviewDecision: 'CLEAR', level: 'LOW' }));
    expect(repo.updateProfile).toHaveBeenCalledWith('prof-1', expect.objectContaining({ overriddenLevel: 'LOW' }));
    expect(repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'REVIEWED' }));
  });

  it('throws NotFound for an unknown check', async () => {
    repo.findCheck.mockResolvedValue(null);
    await expect(walletRiskService.review('nope', { decision: 'CLEAR' }, {})).rejects.toThrow();
  });
});

describe('evaluateWithdrawalCompliance (pure foundation)', () => {
  it('BLOCKED wallet risk -> HOLD_FOR_REVIEW', () => {
    const r = evaluateWithdrawalCompliance({ walletRiskStatus: 'BLOCKED', travelRuleStatus: 'NOT_REQUIRED' });
    expect(r.decision).toBe('HOLD_FOR_REVIEW');
    expect(r.requiresReview).toBe(true);
    expect(r.reasons).toContain('WALLET_RISK_BLOCKED');
  });

  it('REVIEW_REQUIRED wallet risk -> HOLD_FOR_REVIEW', () => {
    const r = evaluateWithdrawalCompliance({ walletRiskStatus: 'REVIEW_REQUIRED', travelRuleStatus: 'NOT_REQUIRED' });
    expect(r.decision).toBe('HOLD_FOR_REVIEW');
  });

  it('clear wallet risk but Travel Rule REQUIRED -> HOLD_FOR_TRAVEL_RULE', () => {
    const r = evaluateWithdrawalCompliance({ walletRiskStatus: 'CLEAR', travelRuleStatus: 'REQUIRED' });
    expect(r.decision).toBe('HOLD_FOR_TRAVEL_RULE');
    expect(r.reasons).toContain('TRAVEL_RULE_INFO_REQUIRED');
  });

  it('clear wallet risk and Travel Rule satisfied -> ALLOW', () => {
    expect(evaluateWithdrawalCompliance({ walletRiskStatus: 'CLEAR', travelRuleStatus: 'SENT_MOCK' }).decision).toBe('ALLOW');
    expect(evaluateWithdrawalCompliance({ walletRiskStatus: null, travelRuleStatus: null }).decision).toBe('ALLOW');
    expect(evaluateWithdrawalCompliance({ walletRiskStatus: 'CLEAR', travelRuleStatus: 'EXEMPTED' }).decision).toBe('ALLOW');
  });
});
