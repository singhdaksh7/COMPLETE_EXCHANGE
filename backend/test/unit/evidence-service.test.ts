import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Evidence-pack generation, masking/no-secrets, checksum, and export-event tests.
 * Source repositories + audit are mocked so assembly runs without a database.
 */

vi.mock('../../src/modules/compliance/evidence.repository', () => ({
  evidenceRepository: {
    createPack: vi.fn(),
    updatePack: vi.fn(),
    findPack: vi.fn(),
    listPacks: vi.fn(),
    createItems: vi.fn().mockResolvedValue({ count: 0 }),
    createExportEvent: vi.fn().mockResolvedValue({}),
    listExportEvents: vi.fn(),
    findUserBasic: vi.fn(),
    alertsForUser: vi.fn().mockResolvedValue([]),
    casesForUser: vi.fn().mockResolvedValue([]),
    caseById: vi.fn(),
    walletRiskChecksForUser: vi.fn().mockResolvedValue([]),
    walletRiskProfileById: vi.fn(),
    travelRuleForUser: vi.fn().mockResolvedValue([]),
    travelRuleById: vi.fn(),
    auditForUser: vi.fn().mockResolvedValue({ audit: [], adminLogs: [] }),
  },
}));

vi.mock('../../src/modules/compliance/compliance.repository', () => ({
  complianceRepository: {
    findProfileWithUser: vi.fn(),
    listEvidence: vi.fn().mockResolvedValue([]),
    listConsents: vi.fn().mockResolvedValue([]),
    listRiskAssessments: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/modules/compliance/screening.repository', () => ({
  screeningRepository: { listChecks: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { evidenceService, PACK_LABEL } from '../../src/modules/compliance/evidence.service';
import { evidenceRepository } from '../../src/modules/compliance/evidence.repository';
import { complianceRepository } from '../../src/modules/compliance/compliance.repository';

const repo = vi.mocked(evidenceRepository);
const compRepo = vi.mocked(complianceRepository);

const SECRET = 'TOPSECRETVALUE';

function profileWithUser() {
  return {
    userId: 'user-1', customerType: 'INDIVIDUAL', status: 'APPROVED',
    fullName: 'Asha Verma', dateOfBirth: new Date('1990-01-01'), nationality: 'IN', countryOfResidence: 'IN',
    addressLine1: 'a', addressLine2: null, city: 'Mumbai', state: 'MH', postalCode: '400001', country: 'IN',
    panMasked: 'ABCDE****F', panLast4: '234F', panEnc: Buffer.from('rawpan-encrypted'),
    aadhaarMasked: 'XXXX XXXX 1234', aadhaarLast4: '1234', aadhaarRefEnc: Buffer.from('rawaadhaar-encrypted'),
    riskLevel: 'LOW', riskScore: 0, riskReason: null,
    onboardingIp: '203.0.113.9', onboardingCountry: 'IN', onboardingRegion: 'MH', onboardingCity: 'Mumbai',
    onboardingLatitude: null, onboardingLongitude: null, onboardingUserAgent: 'UA', geoCaptureStatus: 'CAPTURED',
    livenessStatus: 'PASSED', livenessProvider: null, livenessReference: null, livenessScore: null,
    sanctionsStatus: 'CLEAR', pepStatus: 'CLEAR', adverseMediaStatus: 'CLEAR',
    kycProvider: 'mock', kycProviderReference: null, consentVersion: 'v1', complianceNote: null,
    verifiedAt: null, lastReviewedAt: null, nextReviewDueAt: null, retentionUntil: null,
    reviewedByAdminId: null, createdAt: new Date('2026-06-21'), updatedAt: new Date('2026-06-21'),
    user: { email: 'u@example.com', status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.createPack.mockResolvedValue({ id: 'pack-1', format: 'JSON' } as never);
  repo.updatePack.mockResolvedValue({} as never);
  repo.findPack.mockResolvedValue({
    id: 'pack-1', packType: 'USER_KYC', status: 'READY', format: 'JSON', label: PACK_LABEL, title: 't',
    summary: null, scopeUserId: 'user-1', scopeCaseId: null, scopeRef: null, itemCount: 1, checksum: 'abc',
    error: null, generatedByAdminId: 'admin-1', createdAt: new Date(), updatedAt: new Date(), payload: { ok: true },
    items: [],
  } as never);
  compRepo.findProfileWithUser.mockResolvedValue(profileWithUser() as never);
});

describe('evidenceService.generate — USER_KYC', () => {
  it('builds a pack, computes a checksum, and persists items', async () => {
    compRepo.listEvidence.mockResolvedValue([
      { id: 'e1', type: 'PAN', status: 'PENDING', provider: null, referenceId: null, storageKey: null, documentId: null, metadata: { masked: 'ABCDE****F', password: SECRET }, createdAt: new Date(), reviewedAt: null, reviewedByAdminId: null },
    ] as never);

    await evidenceService.generate({ packType: 'USER_KYC', userId: 'user-1' }, { actorId: 'admin-1' });

    expect(repo.createPack).toHaveBeenCalledWith(expect.objectContaining({ packType: 'USER_KYC', status: 'BUILDING', label: PACK_LABEL }));
    const updateArg = repo.updatePack.mock.calls.find((c) => (c[1] as { status?: string }).status === 'READY')?.[1] as Record<string, unknown>;
    expect(updateArg).toBeTruthy();
    expect(updateArg.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect((updateArg.payload as { label: string }).label).toBe(PACK_LABEL);
    expect(repo.createItems).toHaveBeenCalled();
  });

  it('NEVER includes secrets or raw encrypted blobs in the payload', async () => {
    compRepo.listEvidence.mockResolvedValue([
      { id: 'e1', type: 'PAN', status: 'PENDING', provider: null, referenceId: null, storageKey: null, documentId: null, metadata: { password: SECRET, totpSecret: SECRET }, createdAt: new Date(), reviewedAt: null, reviewedByAdminId: null },
    ] as never);

    await evidenceService.generate({ packType: 'USER_KYC', userId: 'user-1' }, { actorId: 'admin-1' });

    const updateArg = repo.updatePack.mock.calls.find((c) => (c[1] as { status?: string }).status === 'READY')?.[1] as Record<string, unknown>;
    const serialized = JSON.stringify(updateArg.payload);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('rawpan-encrypted');
    expect(serialized).not.toContain('rawaadhaar-encrypted');
    expect(serialized).not.toContain('panEnc');
    expect(serialized).not.toContain('aadhaarRefEnc');
    // masked identifier is allowed
    expect(serialized).toContain('ABCDE****F');
  });

  it('rejects USER_KYC without a userId', async () => {
    await expect(evidenceService.generate({ packType: 'USER_KYC' }, {})).rejects.toThrow();
  });
});

describe('evidenceService.generate — STR_CASE', () => {
  it('resolves the subject user from the case and includes a CASE item', async () => {
    repo.caseById.mockResolvedValue({
      id: 'case-1', userId: 'user-1', type: 'SUSPICIOUS_TRANSACTION', status: 'OPEN', priority: 'HIGH',
      title: 'case', summary: null, dedupeKey: null, assignedToAdminId: null, openedByAdminId: null,
      closedByAdminId: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
      alerts: [], notes: [], events: [], user: { email: 'u@example.com' },
    } as never);

    await evidenceService.generate({ packType: 'STR_CASE', caseId: 'case-1' }, { actorId: 'admin-1' });

    expect(repo.createPack).toHaveBeenCalledWith(expect.objectContaining({ packType: 'STR_CASE', scopeUserId: 'user-1', scopeCaseId: 'case-1' }));
    const updateArg = repo.updatePack.mock.calls.find((c) => (c[1] as { status?: string }).status === 'READY')?.[1] as Record<string, unknown>;
    const items = (updateArg.payload as { items: Array<{ itemType: string }> }).items;
    expect(items.some((i) => i.itemType === 'CASE')).toBe(true);
  });

  it('throws when the case is missing', async () => {
    repo.caseById.mockResolvedValue(null);
    await expect(evidenceService.generate({ packType: 'STR_CASE', caseId: 'nope' }, {})).rejects.toThrow();
  });
});

describe('evidenceService.export', () => {
  it('records an export event for a READY pack and returns its payload', async () => {
    const payload = await evidenceService.export('pack-1', { actorId: 'admin-1' });
    expect(repo.createExportEvent).toHaveBeenCalledWith(expect.objectContaining({ exportType: 'EVIDENCE_PACK', packId: 'pack-1' }));
    expect(payload).toEqual({ ok: true });
  });

  it('refuses to export a pack that is not READY', async () => {
    repo.findPack.mockResolvedValue({ id: 'pack-1', status: 'BUILDING' } as never);
    await expect(evidenceService.export('pack-1', {})).rejects.toThrow(/not ready/i);
    expect(repo.createExportEvent).not.toHaveBeenCalled();
  });
});
