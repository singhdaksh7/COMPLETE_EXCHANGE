import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/admin-user-profile/user-timeline.repository', () => ({
  userTimelineRepository: {
    header: vi.fn(),
    adminLogs: vi.fn(),
    auditLogs: vi.fn(),
    inrTransactions: vi.fn(),
    cryptoDeposits: vi.fn(),
    cryptoWithdrawals: vi.fn(),
    orders: vi.fn(),
    trades: vi.fn(),
    complianceCases: vi.fn(),
    complianceNotes: vi.fn(),
  },
}));

import { userTimelineRepository } from '../../src/modules/admin-user-profile/user-timeline.repository';
import { userTimelineService } from '../../src/modules/admin-user-profile/user-timeline.service';

const repo = vi.mocked(userTimelineRepository);
const UID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  repo.header.mockResolvedValue({ id: UID, createdAt: new Date('2026-01-01T00:00:00Z'), emailVerifiedAt: null, phoneVerifiedAt: null } as never);
  repo.adminLogs.mockResolvedValue([]);
  repo.auditLogs.mockResolvedValue([]);
  repo.inrTransactions.mockResolvedValue([]);
  repo.cryptoDeposits.mockResolvedValue([]);
  repo.cryptoWithdrawals.mockResolvedValue([]);
  repo.orders.mockResolvedValue([]);
  repo.trades.mockResolvedValue([]);
  repo.complianceCases.mockResolvedValue([]);
  repo.complianceNotes.mockResolvedValue([]);
});

describe('userTimelineService.getTimeline', () => {
  it('throws when the user does not exist', async () => {
    repo.header.mockResolvedValue(null);
    await expect(userTimelineService.getTimeline(UID, { limit: 25, complianceVisible: true })).rejects.toThrow(/not found/i);
  });

  it('merges sources into one time-ordered feed including the signup event', async () => {
    repo.inrTransactions.mockResolvedValue([
      { id: 'd1', userId: UID, type: 'DEPOSIT', amount: new Prisma.Decimal('500'), status: 'PENDING', createdAt: new Date('2026-03-01T00:00:00Z') } as never,
    ]);
    repo.auditLogs.mockResolvedValue([
      { id: 10n, actorId: UID, action: 'auth.login', ip: '1.2.3.4', entityType: null, entityId: null, occurredAt: new Date('2026-02-01T00:00:00Z') } as never,
    ]);

    const page = await userTimelineService.getTimeline(UID, { limit: 25, complianceVisible: false });

    const types = page.items.map((e) => e.type);
    // Newest first: INR deposit (Mar) > login (Feb) > signup (Jan).
    expect(types).toEqual(['INR_DEPOSIT', 'auth.login', 'SIGNUP']);
    expect(page.items.find((e) => e.type === 'auth.login')?.category).toBe('AUTH');
    expect(page.nextCursor).toBeNull();
  });

  it('omits compliance events unless compliance is visible', async () => {
    repo.complianceCases.mockResolvedValue([
      { id: 'c1', userId: UID, title: 'Case', priority: 'HIGH', status: 'OPEN', createdAt: new Date('2026-04-01T00:00:00Z') } as never,
    ]);

    const hidden = await userTimelineService.getTimeline(UID, { limit: 25, complianceVisible: false });
    expect(hidden.items.find((e) => e.category === 'COMPLIANCE')).toBeUndefined();
    expect(repo.complianceCases).not.toHaveBeenCalled();

    const shown = await userTimelineService.getTimeline(UID, { limit: 25, complianceVisible: true });
    expect(shown.items.find((e) => e.type === 'COMPLIANCE_CASE')).toBeDefined();
  });

  it('derives nextCursor from the last event when more than `limit` exist', async () => {
    // header signup (Jan) + 2 audit logs => 3 events, limit 2 → hasMore.
    repo.auditLogs.mockResolvedValue([
      { id: 2n, actorId: UID, action: 'auth.login', ip: null, entityType: null, entityId: null, occurredAt: new Date('2026-05-02T00:00:00Z') } as never,
      { id: 1n, actorId: UID, action: 'auth.login', ip: null, entityType: null, entityId: null, occurredAt: new Date('2026-05-01T00:00:00Z') } as never,
    ]);

    const page = await userTimelineService.getTimeline(UID, { limit: 2, complianceVisible: false });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('2026-05-01T00:00:00.000Z');
  });
});
