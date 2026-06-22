import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/compliance/aml.repository', () => ({
  amlRepository: {
    listPolicies: vi.fn(),
    findPolicy: vi.fn(),
    findActive: vi.fn(),
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
    demoteActive: vi.fn().mockResolvedValue({ count: 0 }),
    createRule: vi.fn(),
    findRule: vi.fn(),
    updateRule: vi.fn(),
  },
}));
vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { amlService } from '../../src/modules/compliance/aml.service';
import { amlRepository } from '../../src/modules/compliance/aml.repository';

const repo = vi.mocked(amlRepository);

beforeEach(() => vi.clearAllMocks());

describe('amlService.createPolicy', () => {
  it('creates a DRAFT policy', async () => {
    repo.createPolicy.mockResolvedValue({ id: 'p1', version: 'v1' } as never);
    await amlService.createPolicy({ version: 'v1', name: 'Baseline' }, { actorId: 'admin-1' });
    expect(repo.createPolicy).toHaveBeenCalledWith(expect.objectContaining({ version: 'v1', status: 'DRAFT' }));
  });
});

describe('amlService.activate — only one active at a time', () => {
  it('activates this policy and demotes any other active policy', async () => {
    repo.findPolicy.mockResolvedValue({ id: 'p1', version: 'v1', status: 'DRAFT', rules: [] } as never);
    repo.updatePolicy.mockResolvedValue({ id: 'p1', status: 'ACTIVE' } as never);

    await amlService.activate('p1', { actorId: 'admin-1' });

    expect(repo.updatePolicy).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'ACTIVE' }));
    expect(repo.demoteActive).toHaveBeenCalledWith('p1'); // demote all OTHER active policies
  });

  it('refuses to activate an archived policy', async () => {
    repo.findPolicy.mockResolvedValue({ id: 'p1', status: 'ARCHIVED', rules: [] } as never);
    await expect(amlService.activate('p1', {})).rejects.toThrow();
  });
});

describe('amlService.evaluate — review-only', () => {
  it('evaluates the active policy and returns recommended actions only', async () => {
    repo.findActive.mockResolvedValue({
      id: 'p1', version: 'v1', status: 'ACTIVE',
      rules: [{ id: 'r1', ruleType: 'WALLET_RISK', name: 'blocked', severity: 'CRITICAL', action: 'ESCALATE', conditionKey: 'walletRisk.status', operator: 'eq', thresholdValue: 'BLOCKED', enabled: true }],
    } as never);

    const res = await amlService.evaluate({ context: { walletRisk: { status: 'BLOCKED' } } }, { actorId: 'admin-1' });
    expect(res.reviewOnly).toBe(true);
    expect(res.matchedCount).toBe(1);
    expect(res.recommendedActions).toContain('ESCALATE');
  });

  it('strips secrets from the echoed context', async () => {
    repo.findActive.mockResolvedValue({ id: 'p1', version: 'v1', rules: [] } as never);
    const res = await amlService.evaluate({ context: { user: { email: 'u@example.com', passwordHash: 'SECRETHASH' } } }, {});
    expect(JSON.stringify(res.context)).not.toContain('SECRETHASH');
  });

  it('throws when there is no active policy', async () => {
    repo.findActive.mockResolvedValue(null);
    await expect(amlService.evaluate({ context: {} }, {})).rejects.toThrow(/active/i);
  });
});
