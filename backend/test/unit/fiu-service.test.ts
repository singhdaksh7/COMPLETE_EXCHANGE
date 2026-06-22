import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/compliance/fiu.repository', () => ({
  fiuRepository: {
    createReport: vi.fn(),
    updateReport: vi.fn(),
    findReport: vi.fn(),
    listReports: vi.fn(),
    createItems: vi.fn().mockResolvedValue({ count: 0 }),
    createIssues: vi.fn().mockResolvedValue({ count: 0 }),
    listIssues: vi.fn(),
    createExportEvent: vi.fn().mockResolvedValue({}),
    listExportEvents: vi.fn(),
  },
}));
vi.mock('../../src/modules/compliance/evidence.repository', () => ({
  evidenceRepository: {
    caseById: vi.fn(),
    findUserBasic: vi.fn(),
    walletRiskChecksForUser: vi.fn().mockResolvedValue([]),
    findPack: vi.fn(),
    createExportEvent: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/modules/compliance/compliance.repository', () => ({
  complianceRepository: {
    findProfileWithUser: vi.fn(),
    listRiskAssessments: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { fiuService, FIU_LABEL, NOT_SUBMITTED } from '../../src/modules/compliance/fiu.service';
import { fiuRepository } from '../../src/modules/compliance/fiu.repository';
import { evidenceRepository } from '../../src/modules/compliance/evidence.repository';
import { complianceRepository } from '../../src/modules/compliance/compliance.repository';

const repo = vi.mocked(fiuRepository);
const evid = vi.mocked(evidenceRepository);
const comp = vi.mocked(complianceRepository);

function caseRow(over: Record<string, unknown> = {}) {
  return {
    id: 'case-1', userId: 'user-1', type: 'SUSPICIOUS_TRANSACTION', status: 'OPEN', priority: 'HIGH',
    title: 'case', summary: null, dedupeKey: null, assignedToAdminId: null, openedByAdminId: null,
    closedByAdminId: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
    alerts: [{ id: 'a1', userId: 'user-1', type: 'WALLET_RISK_ACTIVITY', status: 'LINKED_TO_CASE', priority: 'HIGH', score: 90, title: 'wallet risk', description: null, details: {}, caseId: 'case-1', resolvedByAdminId: null, resolvedAt: null, createdAt: new Date(), updatedAt: new Date() }],
    notes: [], events: [], user: { email: 'u@example.com' },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.createReport.mockResolvedValue({ id: 'rep-1', format: 'JSON_DRAFT' } as never);
  repo.updateReport.mockResolvedValue({} as never);
  comp.findProfileWithUser.mockResolvedValue(null);
  evid.findUserBasic.mockResolvedValue({ id: 'user-1', email: 'u@example.com', kycStatus: 'APPROVED' } as never);
});

describe('fiuService.generate', () => {
  it('builds an STR draft from a case with the FIU label + NOT_SUBMITTED state', async () => {
    evid.caseById.mockResolvedValue(caseRow() as never);
    repo.findReport.mockResolvedValue({
      id: 'rep-1', reportType: 'STR', status: 'DRAFT', scopeType: 'CASE', format: 'JSON_DRAFT', label: FIU_LABEL,
      submissionState: NOT_SUBMITTED, title: 't', narrative: 'x', scopeUserId: 'user-1', scopeCaseId: 'case-1',
      evidencePackId: null, sourceRefs: {}, checksum: 'abc', errorCount: 0, warningCount: 0, generatedByAdminId: 'admin-1',
      createdAt: new Date(), updatedAt: new Date(), payload: { label: FIU_LABEL }, items: [], issues: [],
    } as never);

    await fiuService.generate({ reportType: 'STR', scopeType: 'CASE', caseId: 'case-1', narrative: 'Suspicious' }, { actorId: 'admin-1' });

    expect(repo.createReport).toHaveBeenCalledWith(expect.objectContaining({ reportType: 'STR', label: FIU_LABEL, submissionState: NOT_SUBMITTED, scopeUserId: 'user-1', scopeCaseId: 'case-1' }));
    const updateArg = repo.updateReport.mock.calls.find((c) => (c[1] as { checksum?: string }).checksum)?.[1] as Record<string, unknown>;
    expect(updateArg.checksum).toMatch(/^[0-9a-f]{64}$/);
    const payloadStr = JSON.stringify(updateArg.payload);
    expect(payloadStr).toContain(FIU_LABEL);
    expect(payloadStr).toContain(NOT_SUBMITTED);
    expect(repo.createItems).toHaveBeenCalled();
  });

  it('references an evidence pack by id + minimized summary (no full payload)', async () => {
    evid.caseById.mockResolvedValue(caseRow() as never);
    evid.findPack.mockResolvedValue({ id: 'pack-1', packType: 'STR_CASE', status: 'READY', checksum: 'c', itemCount: 3, label: 'X', payload: { SHOULD_NOT_LEAK: 'secret-pack-payload' } } as never);
    repo.findReport.mockResolvedValue({ id: 'rep-1', items: [], issues: [], status: 'DRAFT', payload: {} } as never);

    await fiuService.generate({ reportType: 'STR', scopeType: 'CASE', caseId: 'case-1', evidencePackId: 'pack-1', narrative: 'x' }, { actorId: 'admin-1' });

    const updateArg = repo.updateReport.mock.calls.find((c) => (c[1] as { checksum?: string }).checksum)?.[1] as Record<string, unknown>;
    const payloadStr = JSON.stringify(updateArg.payload);
    expect(payloadStr).toContain('pack-1');
    expect(payloadStr).not.toContain('secret-pack-payload'); // only a reference/summary, not the pack payload
  });
});

describe('fiuService.validate', () => {
  it('produces issues and sets READY_FOR_INTERNAL_REVIEW when there are no errors', async () => {
    repo.findReport.mockResolvedValue({
      id: 'rep-1', reportType: 'STR', scopeType: 'CASE', scopeUserId: 'user-1', scopeCaseId: 'case-1',
      evidencePackId: 'pack-1', narrative: 'Suspicious layering', generatedByAdminId: 'admin-1',
      items: [{ itemType: 'SUBJECT' }, { itemType: 'CASE' }, { itemType: 'ALERT' }], payload: { ok: 'ABCDE****F' },
      status: 'DRAFT', errorCount: 0, issues: [],
    } as never);

    await fiuService.validate('rep-1', { actorId: 'admin-1' });

    expect(repo.createIssues).toHaveBeenCalled();
    const upd = repo.updateReport.mock.calls.at(-1)?.[1] as { status?: string };
    expect(upd.status).toBe('READY_FOR_INTERNAL_REVIEW');
  });

  it('keeps status DRAFT when ERROR issues exist (missing narrative on STR)', async () => {
    repo.findReport.mockResolvedValue({
      id: 'rep-1', reportType: 'STR', scopeType: 'CASE', scopeUserId: null, scopeCaseId: null,
      evidencePackId: null, narrative: null, generatedByAdminId: null,
      items: [], payload: {}, status: 'DRAFT', errorCount: 0, issues: [],
    } as never);

    await fiuService.validate('rep-1', {});
    const upd = repo.updateReport.mock.calls.at(-1)?.[1] as { status?: string; errorCount?: number };
    expect(upd.status).toBe('DRAFT');
    expect((upd.errorCount ?? 0)).toBeGreaterThan(0);
  });
});

describe('fiuService.export', () => {
  it('refuses to export with ERROR issues / not-ready status', async () => {
    repo.findReport.mockResolvedValue({ id: 'rep-1', status: 'DRAFT', errorCount: 2 } as never);
    await expect(fiuService.export('rep-1', {})).rejects.toThrow(/no ERROR issues/i);
    expect(repo.createExportEvent).not.toHaveBeenCalled();
  });

  it('records FIU + unified compliance export events for a READY report', async () => {
    repo.findReport.mockResolvedValue({ id: 'rep-1', status: 'READY_FOR_INTERNAL_REVIEW', errorCount: 0, reportType: 'STR', format: 'JSON_DRAFT', checksum: 'c', evidencePackId: null, scopeUserId: 'user-1', payload: { ok: true } } as never);
    await fiuService.export('rep-1', { actorId: 'admin-1' });
    expect(repo.createExportEvent).toHaveBeenCalledWith(expect.objectContaining({ submissionState: NOT_SUBMITTED, label: FIU_LABEL }));
    expect(evid.createExportEvent).toHaveBeenCalledWith(expect.objectContaining({ exportType: 'CASE_EXPORT' }));
  });
});
