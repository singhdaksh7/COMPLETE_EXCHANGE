import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/admin-users/admin-users.repository', () => ({
  adminUsersRepository: {
    listUsers: vi.fn(),
    findUserDetail: vi.fn(),
    recentInrTransactions: vi.fn(),
    recentWithdrawals: vi.fn(),
    recentOrders: vi.fn(),
    recentTrades: vi.fn(),
    recentAdminLogs: vi.fn(),
    recentAuditLogs: vi.fn(),
    findUserForUpdate: vi.fn(),
    updateUser: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { recordAudit } from '../../src/lib/audit';
import { adminUsersRepository } from '../../src/modules/admin-users/admin-users.repository';
import { adminUsersService } from '../../src/modules/admin-users/admin-users.service';

const repo = vi.mocked(adminUsersRepository);
const audit = vi.mocked(recordAudit);

const USER_ID = '11111111-1111-4111-8111-111111111111';

function user(over: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'user@example.com',
    phone: null,
    passwordHash: 'hash',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    phoneVerifiedAt: null,
    kycStatus: 'APPROVED',
    kycTier: 1,
    withdrawalsBlocked: false,
    riskLevel: 'LOW',
    riskNote: null,
    totpSecretEnc: null,
    totpEnabled: false,
    referralCode: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
    deletedAt: null,
    accounts: [
      {
        asset: 'INR',
        kind: 'USER_AVAILABLE',
        balance: { balance: new Prisma.Decimal('1000') },
      },
      {
        asset: 'INR',
        kind: 'USER_LOCKED',
        balance: { balance: new Prisma.Decimal('50') },
      },
    ],
    sessions: [{ createdAt: new Date('2026-06-03T00:00:00Z') }],
    kycProfile: null,
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.writeAdminLog.mockResolvedValue({} as never);
});

describe('adminUsersService', () => {
  it('lists users with balance and last-login summaries and audits the view', async () => {
    repo.listUsers.mockResolvedValue([user()]);

    const result = await adminUsersService.listUsers(
      { limit: 50 },
      { actorId: 'admin-1', ip: '127.0.0.1' },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      email: 'user@example.com',
      accountStatus: 'ACTIVE',
      riskLevel: 'LOW',
      lastLoginAt: new Date('2026-06-03T00:00:00Z'),
    });
    expect(result.items[0].balances).toEqual([
      { asset: 'INR', available: '1000', locked: '50', total: '1050' },
    ]);
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.users.list' }),
    );
  });

  it('freezes a user and writes admin + audit logs', async () => {
    repo.findUserForUpdate.mockResolvedValue(user());
    repo.updateUser.mockResolvedValue(user({ status: 'FROZEN' }));
    repo.findUserDetail.mockResolvedValue(user({ status: 'FROZEN' }));

    const result = await adminUsersService.setAccountStatus(
      USER_ID,
      { status: 'FROZEN' },
      { actorId: 'admin-1' },
    );

    expect(result.accountStatus).toBe('FROZEN');
    expect(repo.updateUser).toHaveBeenCalledWith(USER_ID, { status: 'FROZEN' });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.freeze', entityId: USER_ID }),
    );
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.user.freeze',
        targetType: 'user',
        targetId: USER_ID,
      }),
    );
  });

  it('blocks withdrawals and updates risk note safely', async () => {
    repo.findUserForUpdate.mockResolvedValue(user());
    repo.updateUser
      .mockResolvedValueOnce(user({ withdrawalsBlocked: true }))
      .mockResolvedValueOnce(user({ riskLevel: 'HIGH', riskNote: 'Escalated review' }));
    repo.findUserDetail
      .mockResolvedValueOnce(user({ withdrawalsBlocked: true }))
      .mockResolvedValueOnce(user({ riskLevel: 'HIGH', riskNote: 'Escalated review' }));

    const blocked = await adminUsersService.setWithdrawalBlock(USER_ID, true, {
      actorId: 'admin-1',
    });
    const risk = await adminUsersService.updateRiskProfile(
      USER_ID,
      { riskLevel: 'HIGH', riskNote: 'Escalated review' },
      { actorId: 'admin-1' },
    );

    expect(blocked.withdrawalsBlocked).toBe(true);
    expect(risk.riskLevel).toBe('HIGH');
    expect(risk.riskNote).toBe('Escalated review');
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.withdrawals_block' }),
    );
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.risk_update' }),
    );
  });
});
