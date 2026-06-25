import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/security/audit-review.repository', () => ({
  auditReviewRepository: {
    list: vi.fn(),
    count: vi.fn(),
  },
}));

import { auditReviewRepository } from '../../src/modules/security/audit-review.repository';
import { auditReviewService } from '../../src/modules/security/audit-review.service';
import { classifyRisk } from '../../src/modules/security/audit-review.risk';

const repo = vi.mocked(auditReviewRepository);

function row(id: number, action: string, extra: Record<string, unknown> = {}) {
  return {
    id: BigInt(id),
    adminId: 'admin-1',
    action,
    targetType: 'user',
    targetId: 'user-1',
    reason: null,
    beforeState: null,
    afterState: null,
    ip: '10.0.0.1',
    requestId: null,
    occurredAt: new Date('2026-06-01T00:00:00.000Z'),
    admin: { email: 'a@exora.test' },
    ...extra,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.count.mockResolvedValue(0);
});

describe('classifyRisk', () => {
  it('classifies financial / access-control actions as HIGH', () => {
    expect(classifyRisk('withdrawal.approve')).toBe('HIGH');
    expect(classifyRisk('user.freeze')).toBe('HIGH');
    expect(classifyRisk('role.grant')).toBe('HIGH');
    expect(classifyRisk('admin.login_blocked_ip')).toBe('HIGH');
  });

  it('classifies review / decision actions as MEDIUM', () => {
    expect(classifyRisk('kyc.approve')).toBe('MEDIUM');
    expect(classifyRisk('compliance.case.note')).toBe('MEDIUM');
    expect(classifyRisk('inr.deposit.approve')).toBe('MEDIUM');
  });

  it('classifies everything else as LOW', () => {
    expect(classifyRisk('admin.login')).toBe('LOW');
    expect(classifyRisk('something.view')).toBe('LOW');
  });
});

describe('auditReviewService.review', () => {
  it('maps rows, derives risk, and computes nextCursor when there is more', async () => {
    // limit 2 → repo returns 3 (limit + 1) to signal "has more".
    repo.list.mockResolvedValue([
      row(30, 'withdrawal.approve'),
      row(29, 'kyc.approve'),
      row(28, 'admin.login'),
    ]);
    const res = await auditReviewService.review({ limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.items[0].riskLevel).toBe('HIGH');
    expect(res.items[1].riskLevel).toBe('MEDIUM');
    expect(res.items[0].id).toBe('30');
    expect(res.nextCursor).toBe('29');
    expect(res.items[0].actorEmail).toBe('a@exora.test');
  });

  it('returns null cursor when the page is not full', async () => {
    repo.list.mockResolvedValue([row(5, 'admin.login')]);
    const res = await auditReviewService.review({ limit: 50 });
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });

  it('builds a risk summary from independent counts', async () => {
    repo.list.mockResolvedValue([]);
    repo.count
      .mockResolvedValueOnce(4) // HIGH
      .mockResolvedValueOnce(6) // MEDIUM
      .mockResolvedValueOnce(20); // total
    const res = await auditReviewService.review({ limit: 50 });
    expect(res.summary).toEqual({ high: 4, medium: 6, low: 10, total: 20 });
  });
});
