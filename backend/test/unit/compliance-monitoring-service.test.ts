import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Service-level tests for Stage 5.2 monitoring + case workflow. The repository,
 * the (heavy) compliance.service, screening.service and audit are mocked so the
 * pure orchestration logic — idempotency, auto-case creation, risk recompute and
 * STR draft shape — is exercised without a database.
 */

vi.mock('../../src/modules/compliance/monitoring.repository', () => ({
  monitoringRepository: {
    loadActivity: vi.fn(),
    findProfileSignals: vi.fn(),
    usersWithRecentActivity: vi.fn(),
    findAlert: vi.fn(),
    upsertAlert: vi.fn(),
    updateAlert: vi.fn(),
    listAlerts: vi.fn(),
    findCaseByDedupe: vi.fn(),
    createCase: vi.fn(),
    updateCase: vi.fn(),
    findCase: vi.fn(),
    listCases: vi.fn(),
    countOpenHighRiskCases: vi.fn(),
    createNote: vi.fn(),
    createEvent: vi.fn(),
    summary: vi.fn(),
  },
}));

vi.mock('../../src/modules/compliance/compliance.service', () => ({
  complianceService: { recomputeRisk: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../../src/modules/compliance/compliance.repository', () => ({
  complianceRepository: {
    findUserBasic: vi.fn().mockResolvedValue({ id: 'user-1', email: 'u@example.com' }),
    findProfile: vi.fn().mockResolvedValue({ userId: 'user-1' }),
    findProfileWithUser: vi.fn(),
    listRiskAssessments: vi.fn().mockResolvedValue([]),
    writeAdminLog: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../src/modules/compliance/screening.service', () => ({
  buildScreeningView: vi.fn().mockResolvedValue({ overall: 'CLEAR', blocked: false, blockingCategories: [], byCategory: {}, checks: [] }),
}));

vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { monitoringService } from '../../src/modules/compliance/monitoring.service';
import { caseService } from '../../src/modules/compliance/case.service';
import { monitoringRepository } from '../../src/modules/compliance/monitoring.repository';
import { complianceService } from '../../src/modules/compliance/compliance.service';
import { complianceRepository } from '../../src/modules/compliance/compliance.repository';
import { recordAudit } from '../../src/lib/audit';

const repo = vi.mocked(monitoringRepository);
const compRepo = vi.mocked(complianceRepository);

// A single CRITICAL high-value withdrawal so exactly one HIGH/CRITICAL alert fires.
function bigWithdrawalActivity() {
  return {
    withdrawals: [
      { id: 'w1', kind: 'CRYPTO' as const, asset: 'USDT', amount: 25000, outcome: 'SUCCESS' as const, status: 'COMPLETED', at: new Date() },
    ],
    deposits: [],
    trades: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findProfileSignals.mockResolvedValue({ riskLevel: 'LOW', sanctionsStatus: 'CLEAR', pepStatus: 'CLEAR', adverseMediaStatus: 'CLEAR' } as never);
  repo.loadActivity.mockResolvedValue(bigWithdrawalActivity() as never);
  repo.createEvent.mockResolvedValue({} as never);
  repo.updateAlert.mockResolvedValue({} as never);
  repo.updateCase.mockResolvedValue({} as never);
});

describe('monitoringService.runForUser — auto-case creation', () => {
  it('creates an alert, auto-opens a case, links the alert, audits and recomputes risk', async () => {
    repo.upsertAlert.mockResolvedValue({ alert: { id: 'a1', caseId: null, priority: 'CRITICAL', type: 'HIGH_VALUE_WITHDRAWAL', status: 'OPEN' }, created: true } as never);
    repo.findCaseByDedupe.mockResolvedValue(null);
    repo.createCase.mockResolvedValue({ id: 'c1', priority: 'CRITICAL', status: 'OPEN' } as never);

    const res = await monitoringService.runForUser('user-1', { system: true });

    expect(res.alertsCreated).toBe(1);
    expect(res.casesCreated).toBe(1);
    expect(res.alertsLinked).toBe(1);
    expect(repo.createCase).toHaveBeenCalledTimes(1);
    // CASE_CREATED + ALERT_LINKED events
    const actions = repo.createEvent.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('CASE_CREATED');
    expect(actions).toContain('ALERT_LINKED');
    // admin notification via the audit channel (never the user Notification table)
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ action: 'compliance.case.opened' }));
    // risk recompute fired
    expect(vi.mocked(complianceService.recomputeRisk)).toHaveBeenCalledWith('user-1', 'TRANSACTION', expect.anything());
    // links alert to the case
    expect(repo.updateAlert).toHaveBeenCalledWith('a1', expect.objectContaining({ caseId: 'c1', status: 'LINKED_TO_CASE' }));
  });

  it('is idempotent: a re-run with an existing alert creates no new case or link', async () => {
    // Simulate the dedupeKey already existing -> created:false.
    repo.upsertAlert.mockResolvedValue({ alert: { id: 'a1', caseId: 'c1', priority: 'CRITICAL', type: 'HIGH_VALUE_WITHDRAWAL', status: 'LINKED_TO_CASE' }, created: false } as never);

    const res = await monitoringService.runForUser('user-1', { system: true });

    expect(res.alertsCreated).toBe(0);
    expect(res.alertsExisting).toBe(1);
    expect(res.casesCreated).toBe(0);
    expect(repo.createCase).not.toHaveBeenCalled();
    expect(repo.findCaseByDedupe).not.toHaveBeenCalled();
  });

  it('links a second HIGH/CRITICAL alert to the SAME day case (find, not create)', async () => {
    repo.upsertAlert.mockResolvedValue({ alert: { id: 'a2', caseId: null, priority: 'HIGH', type: 'HIGH_VALUE_WITHDRAWAL', status: 'OPEN' }, created: true } as never);
    repo.findCaseByDedupe.mockResolvedValue({ id: 'c1', priority: 'HIGH', status: 'OPEN' } as never);

    const res = await monitoringService.runForUser('user-1', { system: true });

    expect(repo.createCase).not.toHaveBeenCalled();
    expect(res.alertsLinked).toBe(1);
    expect(repo.updateAlert).toHaveBeenCalledWith('a2', expect.objectContaining({ caseId: 'c1' }));
  });
});

describe('caseService.create — manual case', () => {
  it('creates a HIGH case, logs CASE_CREATED, notifies admins and recomputes risk', async () => {
    repo.createCase.mockResolvedValue({ id: 'c9', priority: 'HIGH' } as never);
    repo.findCase.mockResolvedValue({
      id: 'c9', userId: 'user-1', type: 'MANUAL_REVIEW', status: 'OPEN', priority: 'HIGH',
      title: 't', summary: null, dedupeKey: null, assignedToAdminId: null, openedByAdminId: 'admin-1',
      closedByAdminId: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
      alerts: [], notes: [], events: [], user: { email: 'u@example.com' },
    } as never);

    await caseService.create(
      { userId: 'user-1', type: 'MANUAL_REVIEW', priority: 'HIGH', title: 'Manual review' },
      { actorId: 'admin-1' },
    );

    expect(repo.createCase).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', priority: 'HIGH', openedByAdminId: 'admin-1' }));
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ action: 'compliance.case.opened' }));
    expect(vi.mocked(complianceService.recomputeRisk)).toHaveBeenCalled();
  });

  it('a LOW manual case does NOT notify admins or recompute risk', async () => {
    repo.createCase.mockResolvedValue({ id: 'c10', priority: 'LOW' } as never);
    repo.findCase.mockResolvedValue({
      id: 'c10', userId: 'user-1', type: 'MANUAL_REVIEW', status: 'OPEN', priority: 'LOW',
      title: 't', summary: null, dedupeKey: null, assignedToAdminId: null, openedByAdminId: 'admin-1',
      closedByAdminId: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
      alerts: [], notes: [], events: [], user: { email: 'u@example.com' },
    } as never);

    await caseService.create(
      { userId: 'user-1', type: 'MANUAL_REVIEW', priority: 'LOW', title: 'Low' },
      { actorId: 'admin-1' },
    );

    expect(vi.mocked(recordAudit)).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'compliance.case.opened' }));
    expect(vi.mocked(complianceService.recomputeRisk)).not.toHaveBeenCalled();
  });
});

describe('caseService.setStatus — closing recomputes risk', () => {
  it('CLOSED stamps closedAt/closedBy and recomputes risk', async () => {
    repo.findCase.mockResolvedValue({
      id: 'c1', userId: 'user-1', status: 'OPEN', priority: 'HIGH', type: 'SUSPICIOUS_TRANSACTION',
      title: 't', summary: null, dedupeKey: null, assignedToAdminId: null, openedByAdminId: null,
      closedByAdminId: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
      alerts: [], notes: [], events: [], user: { email: 'u@example.com' },
    } as never);

    await caseService.setStatus('c1', 'CLOSED', 'resolved benign', { actorId: 'admin-1' });

    expect(repo.updateCase).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'CLOSED', closedByAdminId: 'admin-1' }));
    expect(compRepo.findProfile).toHaveBeenCalledWith('user-1');
    expect(vi.mocked(complianceService.recomputeRisk)).toHaveBeenCalled();
  });
});

describe('caseService.exportStrDraft — shape + safety', () => {
  const RAW_PAN = 'ABCDE1234F';
  const RAW_AADHAAR = '123412341234';

  beforeEach(() => {
    repo.findCase.mockResolvedValue({
      id: 'c1', userId: 'user-1', type: 'SUSPICIOUS_TRANSACTION', status: 'STR_DRAFTED', priority: 'HIGH',
      title: 'case', summary: 's', dedupeKey: 'AUTOCASE:user-1:2026-06-22',
      assignedToAdminId: null, openedByAdminId: null, closedByAdminId: null, closedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
      alerts: [{ id: 'a1', userId: 'user-1', type: 'HIGH_VALUE_WITHDRAWAL', status: 'LINKED_TO_CASE', priority: 'HIGH', score: 80, title: 'High-value withdrawal', description: null, details: { withdrawalId: 'w1' }, caseId: 'c1', resolvedByAdminId: null, resolvedAt: null, createdAt: new Date(), updatedAt: new Date() }],
      notes: [{ id: 'n1', adminId: 'admin-1', body: 'looking into it', createdAt: new Date() }],
      events: [{ id: 'e1', action: 'CASE_CREATED', actorAdminId: null, metadata: {}, createdAt: new Date() }],
      user: { email: 'u@example.com' },
    } as never);
    repo.loadActivity.mockResolvedValue({
      withdrawals: [{ id: 'w1', kind: 'CRYPTO', asset: 'USDT', amount: 25000, outcome: 'SUCCESS', status: 'COMPLETED', at: new Date() }],
      deposits: [],
      trades: [],
    } as never);
    // Profile carries encrypted blobs which must NOT leak into the export.
    compRepo.findProfileWithUser.mockResolvedValue({
      userId: 'user-1', panMasked: 'ABCDE****F', panLast4: '234F',
      panEnc: Buffer.from(RAW_PAN), aadhaarRefEnc: Buffer.from(RAW_AADHAAR), aadhaarMasked: 'XXXX XXXX 1234',
      riskLevel: 'HIGH', riskScore: 70,
      user: { email: 'u@example.com', status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1 },
    } as never);
  });

  it('is clearly marked STR_DRAFT_ONLY and never claims an FIU filing', async () => {
    const draft = await caseService.exportStrDraft('c1', { actorId: 'admin-1' });
    expect(draft.exportType).toBe('STR_DRAFT_ONLY');
    expect(draft.disclaimer).toMatch(/NOT a Suspicious Transaction Report filed/i);
  });

  it('includes alerts, linked transactions, notes, admin actions, risk + screening summary', async () => {
    const draft = await caseService.exportStrDraft('c1', { actorId: 'admin-1' });
    expect(draft.alerts).toHaveLength(1);
    expect(draft.linkedTransactions.withdrawals).toHaveLength(1);
    expect(draft.notes).toHaveLength(1);
    expect(draft.adminActions.length).toBeGreaterThan(0);
    expect(draft.riskSummary.level).toBe('HIGH');
    expect(draft.screeningSummary).toBeTruthy();
    // an STR_EXPORTED event is recorded
    expect(repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'STR_EXPORTED' }));
  });

  it('contains NO raw PAN/Aadhaar or encrypted blobs', async () => {
    const draft = await caseService.exportStrDraft('c1', { actorId: 'admin-1' });
    const serialized = JSON.stringify(draft);
    expect(serialized).not.toContain(RAW_PAN);
    expect(serialized).not.toContain(RAW_AADHAAR);
    expect(serialized).not.toContain('panEnc');
    expect(serialized).not.toContain('aadhaarRefEnc');
  });
});
