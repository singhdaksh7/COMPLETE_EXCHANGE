import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/compliance/compliance.repository', () => ({
  complianceRepository: {
    findUserBasic: vi.fn(),
    findProfile: vi.fn(),
    findProfileWithUser: vi.fn(),
    upsertProfile: vi.fn(),
    updateProfile: vi.fn(),
    listProfiles: vi.fn(),
    createEvidence: vi.fn(),
    listEvidence: vi.fn(),
    createConsents: vi.fn(),
    listConsents: vi.fn(),
    createRiskAssessment: vi.fn(),
    listRiskAssessments: vi.fn(),
    countRejections: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/modules/notification/notification.service', () => ({
  notificationService: { notify: vi.fn() },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { update: vi.fn().mockResolvedValue({}) } },
}));

import { complianceService } from '../../src/modules/compliance/compliance.service';
import { complianceRepository } from '../../src/modules/compliance/compliance.repository';
import { notificationService } from '../../src/modules/notification/notification.service';

const repo = vi.mocked(complianceRepository);
const notify = vi.mocked(notificationService.notify);

const RAW_PAN = 'ABCDE1234F';
const RAW_AADHAAR = '123412341234';

function makeProfile(over: Record<string, unknown> = {}) {
  return {
    id: 'cp-1',
    userId: 'user-1',
    customerType: 'INDIVIDUAL',
    status: 'SUBMITTED',
    fullName: 'Test User',
    dateOfBirth: new Date('1990-01-01'),
    nationality: 'IN',
    countryOfResidence: 'IN',
    addressLine1: 'a', addressLine2: null, city: 'Mumbai', state: 'MH', postalCode: '400001', country: 'IN',
    panMasked: 'ABCDE****F', panLast4: '234F', panEnc: Buffer.from('enc'),
    aadhaarMasked: 'XXXX XXXX 1234', aadhaarLast4: '1234', aadhaarRefEnc: Buffer.from('enc'),
    riskLevel: 'LOW', riskScore: 0, riskReason: null,
    onboardingIp: '203.0.113.9', onboardingCountry: 'IN', onboardingRegion: 'MH', onboardingCity: 'Mumbai',
    onboardingLatitude: null, onboardingLongitude: null, onboardingUserAgent: 'Mozilla/5.0',
    geoCaptureStatus: 'CAPTURED',
    livenessStatus: 'NOT_STARTED', livenessProvider: null, livenessReference: null, livenessScore: null,
    sanctionsStatus: 'CLEAR', pepStatus: 'CLEAR', adverseMediaStatus: 'CLEAR',
    kycProvider: 'liveness-mock', kycProviderReference: null, consentVersion: 'v1-2026-06',
    complianceNote: null, verifiedAt: null, reviewedByAdminId: null,
    lastReviewedAt: null, nextReviewDueAt: null, retentionUntil: new Date('2031-01-01'),
    createdAt: new Date('2026-06-21'), updatedAt: new Date('2026-06-21'),
    ...over,
  };
}

const GEO = {
  ip: '203.0.113.9', country: 'IN', region: 'MH', city: 'Mumbai',
  latitude: null, longitude: null, userAgent: 'Mozilla/5.0', status: 'CAPTURED' as const,
};

const SUBMIT_INPUT = {
  customerType: 'INDIVIDUAL' as const,
  fullName: 'Test User',
  dateOfBirth: '1990-01-01',
  nationality: 'IN',
  countryOfResidence: 'IN',
  address: { line1: 'a', city: 'Mumbai', state: 'MH', postalCode: '400001', country: 'IN' },
  pan: RAW_PAN,
  aadhaar: RAW_AADHAAR,
  consents: { kycProcessing: true, amlScreening: true, dataRetention: true, termsAccepted: true, riskDisclosure: true } as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.findUserBasic.mockResolvedValue({ id: 'user-1', email: 'u@example.com', status: 'ACTIVE', kycStatus: 'NOT_STARTED', kycTier: 0, riskLevel: 'LOW' } as never);
  repo.countRejections.mockResolvedValue(0);
  repo.createConsents.mockResolvedValue({ count: 5 } as never);
  repo.createEvidence.mockResolvedValue({} as never);
  repo.updateProfile.mockResolvedValue(makeProfile() as never);
  repo.createRiskAssessment.mockResolvedValue({} as never);
  notify.mockResolvedValue(undefined);
});

describe('complianceService.submitEnhanced', () => {
  it('persists MASKED identifiers only (never the raw PAN/Aadhaar)', async () => {
    repo.findProfile.mockResolvedValueOnce(null).mockResolvedValue(makeProfile() as never);
    repo.upsertProfile.mockResolvedValue(makeProfile() as never);

    await complianceService.submitEnhanced('user-1', SUBMIT_INPUT, GEO, { actorId: 'user-1', ip: '203.0.113.9' });

    const createArg = repo.upsertProfile.mock.calls[0][1] as Record<string, unknown>;
    expect(createArg.panMasked).toBe('ABCDE****F');
    expect(createArg.panLast4).toBe('234F');
    // Raw values must never appear in what we persist.
    const serialized = JSON.stringify(createArg);
    expect(serialized).not.toContain(RAW_PAN);
    expect(serialized).not.toContain(RAW_AADHAAR);
    // PAN is sealed as an encrypted Buffer, not plaintext.
    expect(Buffer.isBuffer((createArg as { panEnc: unknown }).panEnc)).toBe(true);
  });

  it('captures onboarding geo/IP/user-agent evidence', async () => {
    repo.findProfile.mockResolvedValueOnce(null).mockResolvedValue(makeProfile() as never);
    repo.upsertProfile.mockResolvedValue(makeProfile() as never);

    await complianceService.submitEnhanced('user-1', SUBMIT_INPUT, GEO, {});

    const createArg = repo.upsertProfile.mock.calls[0][1] as Record<string, unknown>;
    expect(createArg.onboardingIp).toBe('203.0.113.9');
    expect(createArg.onboardingCountry).toBe('IN');
    expect(createArg.onboardingUserAgent).toBe('Mozilla/5.0');
    expect(createArg.geoCaptureStatus).toBe('CAPTURED');
  });

  it('captures all five consents and notifies KYC_SUBMITTED', async () => {
    repo.findProfile.mockResolvedValueOnce(null).mockResolvedValue(makeProfile() as never);
    repo.upsertProfile.mockResolvedValue(makeProfile() as never);

    await complianceService.submitEnhanced('user-1', SUBMIT_INPUT, GEO, {});

    const consentRows = repo.createConsents.mock.calls[0][0];
    expect(consentRows).toHaveLength(5);
    expect(consentRows.map((c) => c.consentType).sort()).toEqual(
      ['AML_SCREENING', 'DATA_RETENTION', 'KYC_PROCESSING', 'RISK_DISCLOSURE', 'TERMS_ACCEPTANCE'],
    );
    expect(repo.createRiskAssessment).toHaveBeenCalled(); // risk scored
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'KYC_SUBMITTED' }));
  });
});

describe('complianceService.verifyLiveness', () => {
  it('a FAILED liveness updates status and notifies KYC_LIVENESS_FAILED', async () => {
    repo.findProfile.mockResolvedValue(makeProfile() as never);

    const res = await complianceService.verifyLiveness(
      'user-1',
      { providerReference: 'live_abc123def456', simulateOutcome: 'FAILED' },
      {},
    );

    expect(res.status).toBe('FAILED');
    expect(repo.updateProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ livenessStatus: 'FAILED' }),
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'KYC_LIVENESS_FAILED' }));
  });
});

describe('complianceService.review — resilient to mail failure', () => {
  beforeEach(() => {
    repo.findProfile.mockResolvedValue(makeProfile({ status: 'SUBMITTED' }) as never);
    repo.findProfileWithUser.mockResolvedValue(
      { ...makeProfile(), user: { email: 'u@example.com', status: 'ACTIVE', kycStatus: 'NOT_STARTED', kycTier: 0 } } as never,
    );
    repo.listEvidence.mockResolvedValue([] as never);
    repo.listConsents.mockResolvedValue([] as never);
    repo.listRiskAssessments.mockResolvedValue([] as never);
  });

  it('APPROVE updates status to APPROVED even when notifications throw', async () => {
    notify.mockRejectedValue(new Error('SES down'));

    const detail = await complianceService.review('user-1', { decision: 'APPROVE' }, { actorId: 'admin-1' });

    expect(repo.updateProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ status: 'APPROVED' }),
    );
    expect(detail.profile.email).toBe('u@example.com');
  });

  it('REJECT records an ADMIN rejection risk assessment (for repeated-rejection rule)', async () => {
    const detail = await complianceService.review(
      'user-1',
      { decision: 'REJECT', reason: 'Document mismatch' },
      { actorId: 'admin-1' },
    );
    expect(repo.createRiskAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ADMIN' }),
    );
    expect(detail).toBeTruthy();
  });
});

describe('complianceService.exportSummary', () => {
  it('produces a summary with NO raw identifiers or encrypted blobs', async () => {
    repo.findProfileWithUser.mockResolvedValue(
      { ...makeProfile(), user: { email: 'u@example.com', status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1 } } as never,
    );
    repo.listEvidence.mockResolvedValue([] as never);
    repo.listConsents.mockResolvedValue([] as never);
    repo.listRiskAssessments.mockResolvedValue([] as never);

    const summary = await complianceService.exportSummary('user-1', { actorId: 'admin-1' });
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain(RAW_PAN);
    expect(serialized).not.toContain(RAW_AADHAAR);
    expect(serialized).not.toContain('panEnc');
    expect(serialized).not.toContain('aadhaarRefEnc');
    expect(summary.profile.panMasked).toBe('ABCDE****F');
    expect(summary.disclaimer).toContain('Not a legal compliance attestation');
  });
});
