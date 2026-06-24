import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/admin-notification/admin-notification.repository', () => ({
  adminNotificationRepository: {
    insertNew: vi.fn(),
    list: vi.fn(),
    unreadCount: vi.fn(),
    findById: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    pendingKycUsers: vi.fn(),
    pendingInrByType: vi.fn(),
    cryptoWithdrawalsForReview: vi.fn(),
    openCases: vi.fn(),
    highRiskUsers: vi.fn(),
    walletRiskAlerts: vi.fn(),
    screeningHits: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { recordAudit } from '../../src/lib/audit';
import { adminNotificationRepository } from '../../src/modules/admin-notification/admin-notification.repository';
import { adminNotificationService } from '../../src/modules/admin-notification/admin-notification.service';

const repo = vi.mocked(adminNotificationRepository);
const audit = vi.mocked(recordAudit);

beforeEach(() => {
  vi.clearAllMocks();
  repo.pendingKycUsers.mockResolvedValue([]);
  repo.pendingInrByType.mockResolvedValue([]);
  repo.cryptoWithdrawalsForReview.mockResolvedValue([]);
  repo.openCases.mockResolvedValue([]);
  repo.highRiskUsers.mockResolvedValue([]);
  repo.walletRiskAlerts.mockResolvedValue([]);
  repo.screeningHits.mockResolvedValue([]);
  repo.insertNew.mockResolvedValue(0);
  repo.list.mockResolvedValue([]);
  repo.unreadCount.mockResolvedValue(0);
});

describe('adminNotificationService.refresh', () => {
  it('derives candidates from real operational state with deterministic dedupe keys', async () => {
    repo.pendingKycUsers.mockResolvedValue([{ id: 'u1', email: 'u@e.com', kycStatus: 'PENDING' } as never]);
    repo.openCases.mockResolvedValue([{ id: 'c1', userId: 'u1', title: 'Rapid in/out', priority: 'HIGH' } as never]);
    repo.pendingInrByType.mockImplementation(((type: string) =>
      Promise.resolve(type === 'DEPOSIT' ? [{ id: 'd1', userId: 'u1', amount: new Prisma.Decimal('500') }] : [])) as never);
    repo.insertNew.mockResolvedValue(3);

    const created = await adminNotificationService.refresh();

    expect(created).toBe(3);
    const candidates = repo.insertNew.mock.calls[0][0];
    const keys = candidates.map((c) => c.dedupeKey);
    expect(keys).toContain('kyc_review:u1');
    expect(keys).toContain('case_opened:c1');
    expect(keys).toContain('inr_deposit_pending:d1');
    // CRITICAL severity for HIGH-priority cases.
    expect(candidates.find((c) => c.dedupeKey === 'case_opened:c1')?.severity).toBe('CRITICAL');
  });

  it('list refreshes first, then returns paginated items + unread count', async () => {
    repo.list.mockResolvedValue([
      { id: 'n1', type: 'KYC_REVIEW', severity: 'INFO', title: 't', message: 'm', targetType: 'user', targetId: 'u1', isRead: false, readAt: null, readByAdminId: null, createdAt: new Date() } as never,
    ]);
    repo.unreadCount.mockResolvedValue(1);

    const res = await adminNotificationService.list({ limit: 50 });

    expect(repo.insertNew).toHaveBeenCalled(); // refresh ran
    expect(res.items).toHaveLength(1);
    expect(res.unread).toBe(1);
    expect(res.nextCursor).toBeNull();
  });
});

describe('adminNotificationService mark read', () => {
  it('marks one read and audits when a row changed', async () => {
    repo.markRead.mockResolvedValue(1);
    const res = await adminNotificationService.markRead('n1', { actorId: 'admin-1' });
    expect(res.updated).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.notification.read', entityId: 'n1' }));
  });

  it('does not audit a read no-op', async () => {
    repo.markRead.mockResolvedValue(0);
    const res = await adminNotificationService.markRead('n1', { actorId: 'admin-1' });
    expect(res.updated).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it('marks all read and audits the count', async () => {
    repo.markAllRead.mockResolvedValue(4);
    const res = await adminNotificationService.markAllRead({ actorId: 'admin-1' });
    expect(res.updated).toBe(4);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.notification.read_all' }));
  });
});
