import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/admin-user-profile/admin-user-profile.repository', () => ({
  PROFILE_PAGE_SIZE: 10,
  adminUserProfileRepository: {
    findHeader: vi.fn(),
    findUserState: vi.fn(),
    inrTransactions: vi.fn(),
    cryptoDeposits: vi.fn(),
    cryptoWithdrawals: vi.fn(),
    orders: vi.fn(),
    trades: vi.fn(),
    sessions: vi.fn(),
    auditTrail: vi.fn(),
    latestScreeningChecks: vi.fn(),
    openAlerts: vi.fn(),
    walletRiskChecks: vi.fn(),
    openCases: vi.fn(),
    revokeSession: vi.fn(),
    writeAdminLog: vi.fn(),
    complianceNotes: vi.fn(),
    createComplianceNote: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { recordAudit } from '../../src/lib/audit';
import { adminUserProfileRepository } from '../../src/modules/admin-user-profile/admin-user-profile.repository';
import { adminUserProfileService } from '../../src/modules/admin-user-profile/admin-user-profile.service';

const repo = vi.mocked(adminUserProfileRepository);
const audit = vi.mocked(recordAudit);
const UID = '11111111-1111-4111-8111-111111111111';

function header(over: Record<string, unknown> = {}) {
  return {
    id: UID,
    email: 'user@example.com',
    phone: null,
    status: 'ACTIVE',
    emailVerifiedAt: new Date('2026-06-01T00:00:00Z'),
    phoneVerifiedAt: null,
    kycStatus: 'APPROVED',
    kycTier: 1,
    withdrawalsBlocked: false,
    riskLevel: 'LOW',
    riskNote: null,
    totpEnabled: false,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
    deletedAt: null,
    kycProfile: null,
    complianceProfile: null,
    featureControls: null,
    accounts: [
      { asset: 'INR', kind: 'USER_AVAILABLE', balance: { balance: new Prisma.Decimal('1000') } },
      { asset: 'INR', kind: 'USER_LOCKED', balance: { balance: new Prisma.Decimal('50') } },
    ],
    ...over,
  } as never;
}

const VIEW_ALL = { complianceVisible: true, canRevokeSessions: true, canManageNotes: true };
const VIEW_BASIC = { complianceVisible: false, canRevokeSessions: false, canManageNotes: false };

beforeEach(() => {
  vi.clearAllMocks();
  repo.inrTransactions.mockResolvedValue([]);
  repo.cryptoDeposits.mockResolvedValue([]);
  repo.cryptoWithdrawals.mockResolvedValue([]);
  repo.orders.mockResolvedValue([]);
  repo.trades.mockResolvedValue([]);
  repo.sessions.mockResolvedValue([]);
  repo.auditTrail.mockResolvedValue([]);
  repo.latestScreeningChecks.mockResolvedValue([]);
  repo.openAlerts.mockResolvedValue([]);
  repo.walletRiskChecks.mockResolvedValue([]);
  repo.openCases.mockResolvedValue([]);
  repo.writeAdminLog.mockResolvedValue({} as never);
  repo.complianceNotes.mockResolvedValue([]);
});

describe('adminUserProfileService.getProfile', () => {
  it('throws when the user does not exist', async () => {
    repo.findHeader.mockResolvedValue(null);
    await expect(adminUserProfileService.getProfile(UID, VIEW_ALL)).rejects.toThrow(
      /not found/i,
    );
  });

  it('aggregates identity, KYC, balances and empty sections; audits the view', async () => {
    repo.findHeader.mockResolvedValue(header());

    const p = await adminUserProfileService.getProfile(UID, VIEW_BASIC, {
      actorId: 'admin-1',
    });

    expect(p.identity).toMatchObject({
      id: UID,
      email: 'user@example.com',
      accountStatus: 'ACTIVE',
      emailVerified: true,
      kycStatus: 'APPROVED',
    });
    expect(p.balances).toEqual([
      { asset: 'INR', available: '1000', locked: '50', total: '1050' },
    ]);
    // Empty sections produce empty pages (no fake data), not errors.
    expect(p.orders).toEqual({ items: [], nextCursor: null });
    expect(p.trades).toEqual({ items: [], nextCursor: null });
    expect(p.complianceNotes).toBeNull();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.profile_view', entityId: UID }),
    );
  });

  it('hides risk/compliance and skips compliance reads when not permitted', async () => {
    repo.findHeader.mockResolvedValue(header());

    const p = await adminUserProfileService.getProfile(UID, VIEW_BASIC);

    expect(p.meta.complianceVisible).toBe(false);
    expect(p.riskCompliance.visible).toBe(false);
    expect(p.riskCompliance.screening).toBeNull();
    expect(p.riskCompliance.flags).toEqual([]);
    expect(repo.latestScreeningChecks).not.toHaveBeenCalled();
    expect(repo.openAlerts).not.toHaveBeenCalled();
  });

  it('includes screening posture and flags when compliance is visible', async () => {
    repo.findHeader.mockResolvedValue(
      header({
        complianceProfile: {
          sanctionsStatus: 'CLEAR',
          pepStatus: 'NOT_SCREENED',
          adverseMediaStatus: 'NOT_SCREENED',
          riskLevel: 'MEDIUM',
          riskScore: 42,
        },
        featureControls: { underComplianceReview: true, manualReviewBeforeWithdrawal: false, blockHighRiskActivity: false, forceKycReview: false, requireEnhancedKyc: false },
      }),
    );
    repo.walletRiskChecks.mockResolvedValue([
      {
        chain: 'TRON',
        address: 'TXYZ1234567890',
        status: 'BLOCKED',
        level: 'HIGH',
        summary: 'sanctioned exposure',
        createdAt: new Date('2026-06-10T00:00:00Z'),
      } as never,
    ]);

    const p = await adminUserProfileService.getProfile(UID, VIEW_ALL);

    expect(p.riskCompliance.visible).toBe(true);
    expect(p.riskCompliance.screening).toMatchObject({ complianceRiskLevel: 'MEDIUM', complianceRiskScore: 42 });
    expect(p.riskCompliance.manualHold.underComplianceReview).toBe(true);
    expect(p.riskCompliance.flags).toHaveLength(1);
    expect(p.riskCompliance.flags[0]).toMatchObject({ kind: 'WALLET_RISK', status: 'BLOCKED' });
  });
});

describe('adminUserProfileService.getSection', () => {
  it('derives nextCursor when more rows exist (limit + 1 returned)', async () => {
    repo.findUserState.mockResolvedValue({ id: UID, email: 'u@e.com', status: 'ACTIVE' } as never);
    // limit = 2, repo returns 3 → hasMore, slice to 2, cursor = last kept id.
    repo.orders.mockResolvedValue([
      { id: 'o1', market: { symbol: 'BTCINR' }, side: 'BUY', type: 'LIMIT', price: new Prisma.Decimal('1'), quantity: new Prisma.Decimal('1'), quoteBudget: null, filledQuantity: new Prisma.Decimal('0'), quoteSpent: new Prisma.Decimal('0'), status: 'OPEN', createdAt: new Date(), closedAt: null },
      { id: 'o2', market: { symbol: 'BTCINR' }, side: 'BUY', type: 'LIMIT', price: new Prisma.Decimal('1'), quantity: new Prisma.Decimal('1'), quoteBudget: null, filledQuantity: new Prisma.Decimal('0'), quoteSpent: new Prisma.Decimal('0'), status: 'OPEN', createdAt: new Date(), closedAt: null },
      { id: 'o3', market: { symbol: 'BTCINR' }, side: 'BUY', type: 'LIMIT', price: new Prisma.Decimal('1'), quantity: new Prisma.Decimal('1'), quoteBudget: null, filledQuantity: new Prisma.Decimal('0'), quoteSpent: new Prisma.Decimal('0'), status: 'OPEN', createdAt: new Date(), closedAt: null },
    ] as never);

    const page = await adminUserProfileService.getSection(UID, 'orders', undefined, 2);

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('o2');
  });

  it('throws when the user does not exist', async () => {
    repo.findUserState.mockResolvedValue(null);
    await expect(
      adminUserProfileService.getSection(UID, 'orders', undefined, 25),
    ).rejects.toThrow(/not found/i);
  });
});

describe('adminUserProfileService.revokeSession', () => {
  it('revokes a session scoped to the user and writes audit + admin logs', async () => {
    repo.findUserState.mockResolvedValue({ id: UID, email: 'u@e.com', status: 'ACTIVE' } as never);
    repo.revokeSession.mockResolvedValue(1);

    const res = await adminUserProfileService.revokeSession(UID, 'sess-1', { actorId: 'admin-1' });

    expect(res).toEqual({ revoked: true });
    expect(repo.revokeSession).toHaveBeenCalledWith(UID, 'sess-1');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.session_revoked', entityId: 'sess-1' }),
    );
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.session_revoke', targetId: UID }),
    );
  });

  it('is an idempotent no-op when the session is already revoked/expired', async () => {
    repo.findUserState.mockResolvedValue({ id: UID, email: 'u@e.com', status: 'ACTIVE' } as never);
    repo.revokeSession.mockResolvedValue(0);

    const res = await adminUserProfileService.revokeSession(UID, 'sess-1', { actorId: 'admin-1' });

    expect(res).toEqual({ revoked: false });
    expect(audit).toHaveBeenCalled();
  });

  it('throws when the user does not exist', async () => {
    repo.findUserState.mockResolvedValue(null);
    await expect(
      adminUserProfileService.revokeSession(UID, 'sess-1', {}),
    ).rejects.toThrow(/not found/i);
  });
});

describe('compliance notes', () => {
  it('loads notes into the aggregate only when compliance is visible', async () => {
    repo.findHeader.mockResolvedValue(header());
    repo.complianceNotes.mockResolvedValue([
      { id: 'n1', adminId: 'admin-1', body: 'reviewed', createdAt: new Date('2026-06-10T00:00:00Z') } as never,
    ]);

    const hidden = await adminUserProfileService.getProfile(UID, VIEW_BASIC);
    expect(hidden.complianceNotes).toBeNull();
    expect(repo.complianceNotes).not.toHaveBeenCalled();

    const shown = await adminUserProfileService.getProfile(UID, VIEW_ALL);
    expect(shown.complianceNotes?.items).toHaveLength(1);
    expect(shown.complianceNotes?.items[0]).toMatchObject({ body: 'reviewed', adminId: 'admin-1' });
  });

  it('adds a note, records the author, and writes audit + admin logs', async () => {
    repo.findUserState.mockResolvedValue({ id: UID, email: 'u@e.com', status: 'ACTIVE' } as never);
    repo.createComplianceNote.mockResolvedValue({
      id: 'n1',
      adminId: 'admin-1',
      body: 'manual hold pending docs',
      createdAt: new Date('2026-06-11T00:00:00Z'),
    } as never);

    const note = await adminUserProfileService.addComplianceNote(
      UID,
      '  manual hold pending docs  ',
      { actorId: 'admin-1' },
    );

    expect(note).toMatchObject({ id: 'n1', adminId: 'admin-1', body: 'manual hold pending docs' });
    expect(repo.createComplianceNote).toHaveBeenCalledWith(UID, 'admin-1', 'manual hold pending docs');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.compliance_note_add', entityId: 'n1' }),
    );
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.compliance_note_add', targetId: UID }),
    );
  });

  it('rejects an empty note body', async () => {
    repo.findUserState.mockResolvedValue({ id: UID, email: 'u@e.com', status: 'ACTIVE' } as never);
    await expect(
      adminUserProfileService.addComplianceNote(UID, '   ', { actorId: 'admin-1' }),
    ).rejects.toThrow(/required/i);
    expect(repo.createComplianceNote).not.toHaveBeenCalled();
  });
});
