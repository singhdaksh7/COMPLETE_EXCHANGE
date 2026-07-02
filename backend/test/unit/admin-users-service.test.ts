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
    // Stage 9C — archive / restore.
    listArchivedUsers: vi.fn(),
    findArchivedUserDetail: vi.fn(),
    findActiveUser: vi.fn(),
    findArchivedUser: vi.fn(),
    userArchiveObligations: vi.fn(),
    archiveUser: vi.fn(),
    restoreUser: vi.fn(),
    findAdminEmailsByIds: vi.fn(),
    revokeAllUserSessions: vi.fn(),
  },
}));

// The archive/restore flow re-checks the SUPER_ADMIN role via the RBAC service.
vi.mock('../../src/modules/admin-rbac/admin-rbac.service', () => ({
  adminRbacService: { getAdminPermissions: vi.fn() },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { recordAudit } from '../../src/lib/audit';
import { adminUsersRepository } from '../../src/modules/admin-users/admin-users.repository';
import { adminUsersService } from '../../src/modules/admin-users/admin-users.service';
import { adminRbacService } from '../../src/modules/admin-rbac/admin-rbac.service';

const repo = vi.mocked(adminUsersRepository);
const audit = vi.mocked(recordAudit);
const rbac = vi.mocked(adminRbacService);

/** All obligations clear — the archivable baseline. */
function noObligations() {
  return {
    nonZeroBalances: [],
    pendingInrDeposits: 0,
    pendingInrWithdrawals: 0,
    openOrders: 0,
    openComplianceCases: 0,
    underComplianceReview: false,
    openSupportTickets: 0,
  };
}

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
    deletedByAdminId: null,
    deletionReason: null,
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
  // Default: the acting admin is a SUPER_ADMIN (archive/restore are gated on it).
  rbac.getAdminPermissions.mockResolvedValue({ roles: ['SUPER_ADMIN'], permissions: [] });
  // History fetches used by the archived-detail projection default to empty.
  repo.recentInrTransactions.mockResolvedValue([] as never);
  repo.recentWithdrawals.mockResolvedValue([] as never);
  repo.recentOrders.mockResolvedValue([] as never);
  repo.recentTrades.mockResolvedValue([] as never);
  repo.recentAdminLogs.mockResolvedValue([] as never);
  repo.recentAuditLogs.mockResolvedValue([] as never);
  repo.findAdminEmailsByIds.mockResolvedValue(new Map());
  repo.revokeAllUserSessions.mockResolvedValue({ count: 2 } as never);
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

describe('adminUsersService — soft delete / archive (Stage 9C)', () => {
  const archived = () =>
    user({ status: 'CLOSED', deletedAt: new Date('2026-07-02T00:00:00Z'), deletedByAdminId: 'admin-1', deletionReason: 'Account closure request' });

  it('archives a user with no obligations, revokes sessions, and audits USER_ARCHIVED', async () => {
    repo.findActiveUser.mockResolvedValue(user());
    repo.userArchiveObligations.mockResolvedValue(noObligations());
    repo.archiveUser.mockResolvedValue(archived());
    repo.findArchivedUserDetail.mockResolvedValue(archived());

    const result = await adminUsersService.archiveUser(
      USER_ID,
      { reason: 'Account closure request' },
      { actorId: 'admin-1', ip: '127.0.0.1' },
    );

    expect(repo.archiveUser).toHaveBeenCalledWith(USER_ID, {
      deletedByAdminId: 'admin-1',
      reason: 'Account closure request',
    });
    expect(repo.revokeAllUserSessions).toHaveBeenCalledWith(USER_ID);
    expect(result.deletionReason).toBe('Account closure request');
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.user.archived',
        afterState: expect.objectContaining({
          event: 'USER_ARCHIVED',
          sessionRevokeReason: 'USER_ARCHIVED_BY_ADMIN',
        }),
      }),
    );
  });

  it('blocks archiving when a non-zero balance exists and never mutates', async () => {
    repo.findActiveUser.mockResolvedValue(user());
    repo.userArchiveObligations.mockResolvedValue({
      ...noObligations(),
      nonZeroBalances: [{ asset: 'INR', kind: 'USER_AVAILABLE', balance: '1000' }],
    });

    await expect(
      adminUsersService.archiveUser(USER_ID, { reason: 'closure' }, { actorId: 'admin-1' }),
    ).rejects.toMatchObject({ errorCode: 'USER_ARCHIVE_BLOCKED' });

    expect(repo.archiveUser).not.toHaveBeenCalled();
    expect(repo.revokeAllUserSessions).not.toHaveBeenCalled();
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.archive_blocked' }),
    );
  });

  it('blocks archiving when a pending obligation (open orders) exists', async () => {
    repo.findActiveUser.mockResolvedValue(user());
    repo.userArchiveObligations.mockResolvedValue({ ...noObligations(), openOrders: 3 });

    await expect(
      adminUsersService.archiveUser(USER_ID, { reason: 'closure' }, { actorId: 'admin-1' }),
    ).rejects.toMatchObject({ errorCode: 'USER_ARCHIVE_BLOCKED' });
    expect(repo.archiveUser).not.toHaveBeenCalled();
  });

  it('refuses archive for a non-SUPER_ADMIN actor', async () => {
    rbac.getAdminPermissions.mockResolvedValue({ roles: ['COMPLIANCE_OFFICER'], permissions: [] });

    await expect(
      adminUsersService.archiveUser(USER_ID, { reason: 'closure' }, { actorId: 'admin-9' }),
    ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });
    expect(repo.findActiveUser).not.toHaveBeenCalled();
  });

  it('lists only archived users with the archive audit anchors', async () => {
    repo.listArchivedUsers.mockResolvedValue([
      { ...archived(), kycProfile: { fullName: 'Jane Doe' } },
    ] as never);
    repo.findAdminEmailsByIds.mockResolvedValue(new Map([['admin-1', 'root@exora.test']]));

    const result = await adminUsersService.listArchivedUsers({ limit: 50 }, { actorId: 'admin-1' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      fullName: 'Jane Doe',
      deletionReason: 'Account closure request',
      deletedByAdminEmail: 'root@exora.test',
      accountStatus: 'CLOSED',
    });
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.users.archived_list' }),
    );
  });
});
