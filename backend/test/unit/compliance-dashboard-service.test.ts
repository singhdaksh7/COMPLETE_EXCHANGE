import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/compliance/dashboard.repository', () => ({
  dashboardRepository: {
    counts: vi.fn(),
    kycReviewQueue: vi.fn(),
    riskReviewQueue: vi.fn(),
    withdrawalReviewQueue: vi.fn(),
    caseQueue: vi.fn(),
    strDraftQueue: vi.fn(),
    alertQueue: vi.fn(),
    walletRiskQueue: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { recordAudit } from '../../src/lib/audit';
import { dashboardRepository } from '../../src/modules/compliance/dashboard.repository';
import { dashboardService } from '../../src/modules/compliance/dashboard.service';
import type { DashboardFilters } from '../../src/modules/compliance/dashboard.repository';

const repo = vi.mocked(dashboardRepository);
const audit = vi.mocked(recordAudit);

const ZERO_COUNTS = {
  pendingKycReviews: 0,
  enhancedKycRequired: 0,
  highRiskUsers: 0,
  openCases: 0,
  highCriticalCases: 0,
  openAlerts: 0,
  pendingWithdrawalReviews: 0,
  screeningFlaggedUsers: 0,
  walletRiskAlerts: 0,
  openStrDrafts: 0,
};

const FILTERS: DashboardFilters = { previewLimit: 8 };

beforeEach(() => {
  vi.clearAllMocks();
  repo.counts.mockResolvedValue({ ...ZERO_COUNTS });
  repo.kycReviewQueue.mockResolvedValue([]);
  repo.riskReviewQueue.mockResolvedValue([]);
  repo.withdrawalReviewQueue.mockResolvedValue([]);
  repo.caseQueue.mockResolvedValue([]);
  repo.strDraftQueue.mockResolvedValue([]);
  repo.alertQueue.mockResolvedValue([]);
  repo.walletRiskQueue.mockResolvedValue([]);
});

describe('dashboardService.getDashboard', () => {
  it('returns real counts and empty queues with no fake data, and audits the view', async () => {
    repo.counts.mockResolvedValue({ ...ZERO_COUNTS, openCases: 3, openAlerts: 5 });

    const d = await dashboardService.getDashboard(FILTERS, { actorId: 'admin-1' });

    expect(d.cards.openCases).toBe(3);
    expect(d.cards.openAlerts).toBe(5);
    // Empty queues are empty arrays (clean empty state), never invented rows.
    expect(d.queues.kycReview).toEqual([]);
    expect(d.queues.openCases).toEqual([]);
    expect(d.queues.recentAlerts).toEqual([]);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'compliance.dashboard.view', actorId: 'admin-1' }),
    );
  });

  it('maps queue rows and masks wallet addresses (no raw PII)', async () => {
    repo.caseQueue.mockResolvedValue([
      {
        id: 'c1',
        userId: 'u1',
        user: { email: 'u@example.com' },
        type: 'SUSPICIOUS_TRANSACTION',
        status: 'OPEN',
        priority: 'HIGH',
        title: 'Rapid in/out',
        assignedToAdminId: null,
        createdAt: new Date('2026-06-01T00:00:00Z'),
      } as never,
    ]);
    repo.walletRiskQueue.mockResolvedValue([
      {
        id: 'w1',
        userId: 'u1',
        chain: 'TRON',
        address: 'TXYZ1234567890ABCDEFG',
        level: 'HIGH',
        status: 'BLOCKED',
        score: 90,
        createdAt: new Date('2026-06-02T00:00:00Z'),
      } as never,
    ]);

    const d = await dashboardService.getDashboard(FILTERS);

    expect(d.queues.openCases[0]).toMatchObject({ id: 'c1', email: 'u@example.com', priority: 'HIGH' });
    const addr = d.queues.walletRisk[0].address;
    expect(addr).toBe('TXYZ12…DEFG');
    expect(addr).not.toContain('1234567890');
  });

  it('echoes applied filters in meta', async () => {
    const d = await dashboardService.getDashboard({
      previewLimit: 8,
      riskLevel: 'HIGH',
      caseStatus: 'OPEN',
      from: new Date('2026-06-01T00:00:00Z'),
    });
    expect(d.meta.appliedFilters).toMatchObject({ riskLevel: 'HIGH', caseStatus: 'OPEN' });
    expect(d.meta.appliedFilters.from).toBe('2026-06-01T00:00:00.000Z');
  });
});
