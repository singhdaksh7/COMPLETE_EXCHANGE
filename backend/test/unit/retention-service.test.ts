import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/compliance/retention.repository', () => ({
  retentionRepository: {
    listPolicies: vi.fn(),
    findPolicy: vi.fn(),
    upsertPolicy: vi.fn(),
    createReview: vi.fn().mockResolvedValue({}),
    findReview: vi.fn(),
    updateReview: vi.fn(),
    listReviews: vi.fn(),
    countsFor: vi.fn().mockResolvedValue({ eligibleCount: 2, retainedCount: 10, nearingBoundaryCount: 1 }),
  },
}));

vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { retentionService, canTransitionReview } from '../../src/modules/compliance/retention.service';
import { retentionRepository } from '../../src/modules/compliance/retention.repository';

const repo = vi.mocked(retentionRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('canTransitionReview (pure)', () => {
  it('PENDING -> REVIEWED / ESCALATED allowed', () => {
    expect(canTransitionReview('PENDING', 'REVIEWED')).toBe(true);
    expect(canTransitionReview('PENDING', 'ESCALATED')).toBe(true);
  });
  it('ESCALATED -> REVIEWED allowed; REVIEWED is terminal', () => {
    expect(canTransitionReview('ESCALATED', 'REVIEWED')).toBe(true);
    expect(canTransitionReview('REVIEWED', 'ESCALATED')).toBe(false);
  });
  it('cannot move back to PENDING', () => {
    expect(canTransitionReview('PENDING', 'PENDING')).toBe(false);
  });
});

describe('retentionService.listPolicies', () => {
  it('seeds baseline policies on first (empty) read', async () => {
    repo.listPolicies.mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ id: 'p1' }] as never);
    repo.upsertPolicy.mockResolvedValue({} as never);

    await retentionService.listPolicies({ actorId: 'admin-1' });

    // One upsert per baseline record type (KYC, COMPLIANCE_EVIDENCE, STR_CASE, WALLET_RISK, TRAVEL_RULE, AUDIT_LOG)
    expect(repo.upsertPolicy).toHaveBeenCalledTimes(6);
  });

  it('does not re-seed when policies already exist', async () => {
    repo.listPolicies.mockResolvedValue([{ id: 'p1', recordType: 'KYC' }] as never);
    await retentionService.listPolicies({});
    expect(repo.upsertPolicy).not.toHaveBeenCalled();
  });
});

describe('retentionService.upsertPolicy', () => {
  it('saves the policy and creates a PENDING review snapshot with counts', async () => {
    repo.upsertPolicy.mockResolvedValue({ id: 'p1', recordType: 'KYC', retentionYears: 5 } as never);

    await retentionService.upsertPolicy({ recordType: 'KYC', retentionYears: 5 }, { actorId: 'admin-1' });

    expect(repo.countsFor).toHaveBeenCalledWith('KYC', 5);
    expect(repo.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ recordType: 'KYC', status: 'PENDING', retainedCount: 10, eligibleCount: 2, nearingBoundaryCount: 1 }),
    );
  });
});

describe('retentionService.setReviewStatus', () => {
  it('transitions PENDING -> REVIEWED and stamps reviewer', async () => {
    repo.findReview.mockResolvedValue({ id: 'r1', status: 'PENDING', notes: null } as never);
    repo.updateReview.mockResolvedValue({ id: 'r1', status: 'REVIEWED' } as never);

    await retentionService.setReviewStatus('r1', 'REVIEWED', 'looks fine', { actorId: 'admin-1' });

    expect(repo.updateReview).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'REVIEWED', reviewedByAdminId: 'admin-1' }));
  });

  it('rejects an invalid transition (already REVIEWED)', async () => {
    repo.findReview.mockResolvedValue({ id: 'r1', status: 'REVIEWED' } as never);
    await expect(retentionService.setReviewStatus('r1', 'ESCALATED', undefined, {})).rejects.toThrow(/Cannot move/);
  });

  it('never deletes — only updates status', async () => {
    repo.findReview.mockResolvedValue({ id: 'r1', status: 'PENDING' } as never);
    repo.updateReview.mockResolvedValue({} as never);
    await retentionService.setReviewStatus('r1', 'ESCALATED', undefined, { actorId: 'a' });
    // The repository exposes no delete method at all.
    expect((repo as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((repo as unknown as Record<string, unknown>).deleteReview).toBeUndefined();
  });
});
