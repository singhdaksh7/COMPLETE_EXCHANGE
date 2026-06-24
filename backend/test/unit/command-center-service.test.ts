import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/operations/command-center.repository', () => ({
  commandCenterRepository: {
    counts: vi.fn(),
    pendingInrDeposits: vi.fn(),
    pendingInrWithdrawals: vi.fn(),
    cryptoWithdrawalsForReview: vi.fn(),
    pendingKycUsers: vi.fn(),
    usersUnderComplianceReview: vi.fn(),
    highRiskUsers: vi.fn(),
    walletRiskAlerts: vi.fn(),
    openComplianceAlerts: vi.fn(),
    openCases: vi.fn(),
    recentSignups: vi.fn(),
    recentAdminActions: vi.fn(),
    recentInrTransactions: vi.fn(),
    recentSecurityEvents: vi.fn(),
    recentHighRiskEvents: vi.fn(),
  },
}));

vi.mock('../../src/modules/system/system.service', () => ({
  systemService: { health: vi.fn() },
}));

import { commandCenterRepository } from '../../src/modules/operations/command-center.repository';
import { systemService } from '../../src/modules/system/system.service';
import { commandCenterService } from '../../src/modules/operations/command-center.service';

const repo = vi.mocked(commandCenterRepository);
const sys = vi.mocked(systemService);

const ZERO = {
  totalUsers: 0,
  newUsersToday: 0,
  pendingKyc: 0,
  enhancedKycRequired: 0,
  openCases: 0,
  openAlerts: 0,
  pendingInrDeposits: 0,
  pendingInrWithdrawals: 0,
  pendingCryptoWithdrawals: 0,
  failedPaymentEvents: 0,
  activeSessions: 0,
  adminActionsToday: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.counts.mockResolvedValue({ ...ZERO });
  for (const fn of [
    repo.pendingInrDeposits, repo.pendingInrWithdrawals, repo.cryptoWithdrawalsForReview,
    repo.pendingKycUsers, repo.usersUnderComplianceReview, repo.highRiskUsers,
    repo.walletRiskAlerts, repo.openComplianceAlerts, repo.openCases, repo.recentSignups,
    repo.recentAdminActions, repo.recentInrTransactions, repo.recentSecurityEvents,
    repo.recentHighRiskEvents,
  ]) {
    (fn as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  }
  sys.health.mockResolvedValue({
    status: 'ok', version: '1.0.0', uptime: 120, environment: 'test', timestamp: 'now',
    dependencies: { postgres: { status: 'up' }, redis: { status: 'up' } },
  } as never);
});

describe('commandCenterService.getCommandCenter', () => {
  it('returns real counts, empty queues and a healthy system card', async () => {
    repo.counts.mockResolvedValue({ ...ZERO, totalUsers: 42, pendingKyc: 3 });

    const d = await commandCenterService.getCommandCenter();

    expect(d.cards.totalUsers).toBe(42);
    expect(d.cards.pendingKyc).toBe(3);
    expect(d.cards.systemHealth).toBe('ok');
    expect(d.operationsQueue.pendingInrDeposits).toEqual([]);
    expect(d.riskQueue.openCases).toEqual([]);
    expect(d.systemHealth).toMatchObject({ available: true, status: 'ok', version: '1.0.0' });
    expect(d.systemHealth.dependencies).toEqual([
      { name: 'postgres', status: 'up' },
      { name: 'redis', status: 'up' },
    ]);
  });

  it('degrades gracefully to an unavailable health card when the probe throws', async () => {
    sys.health.mockRejectedValue(new Error('redis down'));

    const d = await commandCenterService.getCommandCenter();

    expect(d.systemHealth.available).toBe(false);
    expect(d.systemHealth.status).toBe('unavailable');
    expect(d.cards.systemHealth).toBe('unavailable');
  });

  it('masks wallet-risk addresses in the risk queue', async () => {
    repo.walletRiskAlerts.mockResolvedValue([
      { id: 'w1', chain: 'TRON', address: 'TXYZ1234567890ABCDEFG', level: 'HIGH', status: 'BLOCKED', score: 88, createdAt: new Date('2026-06-02T00:00:00Z') } as never,
    ]);

    const d = await commandCenterService.getCommandCenter();
    const addr = d.riskQueue.walletRiskAlerts[0].address;
    expect(addr).toBe('TXYZ12…DEFG');
    expect(addr).not.toContain('1234567890');
  });
});
