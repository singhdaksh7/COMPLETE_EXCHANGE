import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KycDocument, KycProfile } from '@prisma/client';

vi.mock('../../src/modules/kyc/kyc.repository', () => ({
  kycRepository: {
    findUserById: vi.fn(),
    findProfileByUserId: vi.fn(),
    findProfileByProviderRef: vi.fn(),
    findProfileDetail: vi.fn(),
    activitySummary: vi.fn(),
    kycTimeline: vi.fn(),
    recentKycActions: vi.fn(),
    countByStatus: vi.fn(),
    countPendingOlderThan: vi.fn(),
    countHighRiskUsers: vi.fn(),
    setComplianceNote: vi.fn(),
    submitProfile: vi.fn(),
    createDocument: vi.fn(),
    listDocumentsByUser: vi.fn(),
    listProfiles: vi.fn(),
    decide: vi.fn(),
    applyProviderUpdate: vi.fn(),
    findWebhookEvent: vi.fn(),
    createWebhookEvent: vi.fn(),
    markWebhookProcessed: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { kycRepository } from '../../src/modules/kyc/kyc.repository';
import { kycService } from '../../src/modules/kyc/kyc.service';
import { recordAudit } from '../../src/lib/audit';

const repo = vi.mocked(kycRepository);
const audit = vi.mocked(recordAudit);

function makeUser(over: Partial<{ id: string; kycStatus: string; kycTier: number }> = {}) {
  return { id: 'user-1', kycStatus: 'NOT_STARTED', kycTier: 0, ...over } as {
    id: string;
    kycStatus: 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
    kycTier: number;
  };
}

function makeProfile(over: Partial<KycProfile> = {}): KycProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    fullName: 'Jane Doe',
    dob: new Date('1990-01-01'),
    panEnc: Buffer.alloc(0),
    aadhaarRefEnc: null,
    panMasked: 'ABCDE****F',
    aadhaarMasked: null,
    address: null,
    status: 'PENDING',
    provider: 'mock',
    providerRef: 'sess_ref',
    providerSessionId: 'sess_ref',
    providerApplicantId: 'appl_ref',
    livenessStatus: null,
    documentStatus: null,
    riskScore: null,
    rejectedReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as KycProfile;
}

function makeDoc(over: Partial<KycDocument> = {}): KycDocument {
  return {
    id: 'doc-1',
    userId: 'user-1',
    docType: 'PAN',
    storageKey: 'kyc/user-1/pan/abc',
    sha256: 'a'.repeat(64),
    status: 'PENDING',
    createdAt: new Date(),
    ...over,
  } as KycDocument;
}

const submitInput = {
  fullName: 'Jane Doe',
  dob: '1990-01-01',
  pan: 'ABCDE1234F',
};

beforeEach(() => {
  vi.clearAllMocks();
  audit.mockResolvedValue(undefined);
  repo.writeAdminLog.mockResolvedValue({} as never);
});

describe('kycService.submitProfile', () => {
  it('encrypts PII, moves to PENDING, and audits without leaking PAN/Aadhaar', async () => {
    repo.findUserById.mockResolvedValue(makeUser());
    repo.findProfileByUserId.mockResolvedValue(null);
    repo.submitProfile.mockResolvedValue(makeProfile());

    const result = await kycService.submitProfile('user-1', {
      ...submitInput,
      aadhaarRef: 'token-aadhaar-ref',
    });

    expect(result.profile.status).toBe('PENDING');
    expect(result.session.redirectUrl).toContain('mock.local');
    expect(result.session.providerSessionId).toBeTruthy();

    // Persisted values are encrypted Buffers, not the raw strings.
    const persisted = repo.submitProfile.mock.calls[0][1];
    expect(Buffer.isBuffer(persisted.panEnc)).toBe(true);
    expect(persisted.panEnc.toString('utf8')).not.toContain('ABCDE1234F');
    expect(Buffer.isBuffer(persisted.aadhaarRefEnc)).toBe(true);

    // Audit metadata must not carry raw PII.
    const auditArg = audit.mock.calls[0][0];
    expect(auditArg.action).toBe('kyc.profile.submit');
    expect(JSON.stringify(auditArg.metadata)).not.toContain('ABCDE1234F');
    expect(JSON.stringify(auditArg.metadata)).not.toContain('token-aadhaar-ref');
  });

  it('stores aadhaarRefEnc as null when no Aadhaar ref is supplied', async () => {
    repo.findUserById.mockResolvedValue(makeUser());
    repo.findProfileByUserId.mockResolvedValue(null);
    repo.submitProfile.mockResolvedValue(makeProfile());

    await kycService.submitProfile('user-1', submitInput);

    expect(repo.submitProfile.mock.calls[0][1].aadhaarRefEnc).toBeNull();
  });

  it('rejects when KYC is already approved', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ kycStatus: 'APPROVED' }));

    await expect(
      kycService.submitProfile('user-1', submitInput),
    ).rejects.toMatchObject({ errorCode: 'KYC_ALREADY_APPROVED' });
    expect(repo.submitProfile).not.toHaveBeenCalled();
  });

  it('rejects when a submission is already under review', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ kycStatus: 'PENDING' }));
    repo.findProfileByUserId.mockResolvedValue(makeProfile({ status: 'PENDING' }));

    await expect(
      kycService.submitProfile('user-1', submitInput),
    ).rejects.toMatchObject({ errorCode: 'KYC_IN_REVIEW' });
  });
});

describe('kycService.submitDocument', () => {
  it('persists only a storage key and returns a non-stored upload URL', async () => {
    repo.findUserById.mockResolvedValue(makeUser());
    repo.createDocument.mockResolvedValue(makeDoc());

    const result = await kycService.submitDocument('user-1', {
      docType: 'PAN',
      sha256: 'a'.repeat(64),
      contentType: 'image/png',
    });

    expect(result.documentId).toBe('doc-1');
    expect(result.uploadUrl).toContain('kyc/user-1/pan/');
    expect(result.expiresIn).toBeGreaterThan(0);

    const created = repo.createDocument.mock.calls[0][0];
    expect(created.storageKey.startsWith('kyc/user-1/pan/')).toBe(true);
    expect(audit.mock.calls[0][0].action).toBe('kyc.document.submit');
  });

  it('accepts an upload whose declared size is within the limit', async () => {
    repo.findUserById.mockResolvedValue(makeUser());
    repo.createDocument.mockResolvedValue(makeDoc());

    const result = await kycService.submitDocument('user-1', {
      docType: 'PAN',
      sha256: 'a'.repeat(64),
      contentType: 'application/pdf',
      fileSize: 1024 * 1024, // 1 MiB, well under the 10 MiB default
    });
    expect(result.documentId).toBe('doc-1');
  });

  it('rejects an upload that exceeds the maximum size (server-side)', async () => {
    repo.findUserById.mockResolvedValue(makeUser());

    await expect(
      kycService.submitDocument('user-1', {
        docType: 'PAN',
        sha256: 'a'.repeat(64),
        contentType: 'image/png',
        fileSize: 50 * 1024 * 1024, // 50 MiB, over the 10 MiB default
      }),
    ).rejects.toMatchObject({ statusCode: 400, details: { code: 'KYC_FILE_TOO_LARGE' } });
    expect(repo.createDocument).not.toHaveBeenCalled();
  });

  it('rejects a disallowed MIME type at the service layer (defense in depth)', async () => {
    repo.findUserById.mockResolvedValue(makeUser());

    await expect(
      kycService.submitDocument('user-1', {
        docType: 'PAN',
        sha256: 'a'.repeat(64),
        // e.g. an SVG (script-bearing) or any non-allowlisted type
        contentType: 'image/svg+xml',
      }),
    ).rejects.toMatchObject({ statusCode: 400, details: { code: 'KYC_UNSUPPORTED_FILE_TYPE' } });
    expect(repo.createDocument).not.toHaveBeenCalled();
  });
});

describe('kycService.getStatus', () => {
  it('falls back to the user kycStatus when no profile exists', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ kycStatus: 'NOT_STARTED' }));
    repo.findProfileByUserId.mockResolvedValue(null);

    const status = await kycService.getStatus('user-1');
    expect(status).toMatchObject({ status: 'NOT_STARTED', tier: 0, fullName: null });
  });
});

describe('kycService.decide', () => {
  it('approves with the default tier and writes both audit trails', async () => {
    repo.findProfileByUserId.mockResolvedValue(makeProfile({ status: 'PENDING' }));
    repo.findUserById.mockResolvedValue(makeUser({ kycTier: 0 }));
    repo.decide.mockResolvedValue(makeProfile({ status: 'APPROVED' }));

    const result = await kycService.decide('user-1', { decision: 'APPROVE' }, {
      actorId: 'admin-1',
    });

    expect(result.status).toBe('APPROVED');
    expect(result.tier).toBe(1);
    const decideArg = repo.decide.mock.calls[0][1];
    expect(decideArg).toMatchObject({
      status: 'APPROVED',
      userKycStatus: 'APPROVED',
      tier: 1,
      reviewedBy: 'admin-1',
    });
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kyc.approve' }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kyc.approve', actorType: 'ADMIN' }),
    );
  });

  it('honours an explicit reviewer-chosen tier on approval', async () => {
    repo.findProfileByUserId.mockResolvedValue(makeProfile({ status: 'PENDING' }));
    repo.findUserById.mockResolvedValue(makeUser({ kycTier: 0 }));
    repo.decide.mockResolvedValue(makeProfile({ status: 'APPROVED' }));

    const result = await kycService.decide(
      'user-1',
      { decision: 'APPROVE', tier: 3 },
      { actorId: 'admin-1' },
    );

    expect(result.tier).toBe(3);
    expect(repo.decide.mock.calls[0][1].tier).toBe(3);
  });

  it('rejects with a reason and does not change the tier', async () => {
    repo.findProfileByUserId.mockResolvedValue(makeProfile({ status: 'PENDING' }));
    repo.findUserById.mockResolvedValue(makeUser({ kycTier: 0 }));
    repo.decide.mockResolvedValue(
      makeProfile({ status: 'REJECTED', rejectedReason: 'blurry document' }),
    );

    const result = await kycService.decide(
      'user-1',
      { decision: 'REJECT', reason: 'blurry document' },
      { actorId: 'admin-1' },
    );

    expect(result.status).toBe('REJECTED');
    const decideArg = repo.decide.mock.calls[0][1];
    expect(decideArg).toMatchObject({
      status: 'REJECTED',
      userKycStatus: 'REJECTED',
      rejectedReason: 'blurry document',
    });
    expect(decideArg.tier).toBeUndefined();
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kyc.reject', reason: 'blurry document' }),
    );
  });

  it('throws when no profile exists for the user', async () => {
    repo.findProfileByUserId.mockResolvedValue(null);

    await expect(
      kycService.decide('user-1', { decision: 'APPROVE' }, { actorId: 'admin-1' }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });

  it('requests more info: moves to NEEDS_MORE_INFO with a user-safe reason', async () => {
    repo.findProfileByUserId.mockResolvedValue(makeProfile({ status: 'PENDING' }));
    repo.findUserById.mockResolvedValue(makeUser({ kycTier: 0 }));
    repo.decide.mockResolvedValue(
      makeProfile({ status: 'NEEDS_MORE_INFO', rejectedReason: 'send a clearer PAN' }),
    );

    const result = await kycService.decide(
      'user-1',
      { decision: 'REQUEST_INFO', reason: 'send a clearer PAN' },
      { actorId: 'admin-1' },
    );

    expect(result.status).toBe('NEEDS_MORE_INFO');
    const decideArg = repo.decide.mock.calls[0][1];
    expect(decideArg).toMatchObject({
      status: 'NEEDS_MORE_INFO',
      userKycStatus: 'NEEDS_MORE_INFO',
      rejectedReason: 'send a clearer PAN',
    });
    // Request-info must NOT cascade the document statuses.
    expect(decideArg.cascadeDocuments).toBeUndefined();
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kyc.request_info', reason: 'send a clearer PAN' }),
    );
  });

  it('stores the internal compliance note but never returns it on the user DTO', async () => {
    repo.findProfileByUserId.mockResolvedValue(makeProfile({ status: 'PENDING' }));
    repo.findUserById.mockResolvedValue(makeUser({ kycTier: 0 }));
    repo.decide.mockResolvedValue(
      makeProfile({ status: 'REJECTED', rejectedReason: 'blurry' }),
    );

    const result = await kycService.decide(
      'user-1',
      { decision: 'REJECT', reason: 'blurry', complianceNote: 'repeat offender' },
      { actorId: 'admin-1' },
    );

    // The note is persisted via the repository…
    expect(repo.decide.mock.calls[0][1].complianceNote).toBe('repeat offender');
    // …but the user-facing DTO carries no compliance note field at all.
    expect(JSON.stringify(result)).not.toContain('repeat offender');
    expect('complianceNote' in result).toBe(false);
    // And the internal note is not written into the hash-chained audit metadata.
    const approveAudit = audit.mock.calls.find((c) => c[0].action === 'kyc.reject');
    expect(JSON.stringify(approveAudit?.[0].metadata)).not.toContain('repeat offender');
  });
});

describe('kycService.addComplianceNote', () => {
  it('saves an internal note and records an admin-log entry', async () => {
    repo.findProfileByUserId.mockResolvedValue(makeProfile({ status: 'PENDING' }));
    repo.setComplianceNote.mockResolvedValue(makeProfile());
    repo.findProfileDetail.mockResolvedValue({
      ...makeProfile({ complianceNote: 'watchlist hit' }),
      user: {
        email: 'u@example.com',
        kycTier: 0,
        riskLevel: 'LOW',
        riskNote: null,
        status: 'ACTIVE',
        withdrawalsBlocked: false,
      },
    } as never);
    repo.listDocumentsByUser.mockResolvedValue([]);
    repo.activitySummary.mockResolvedValue({
      depositCount: 0,
      withdrawalCount: 0,
      lastDepositAt: null,
      lastWithdrawalAt: null,
    });
    repo.kycTimeline.mockResolvedValue([]);

    const detail = await kycService.addComplianceNote('user-1', 'watchlist hit', {
      actorId: 'admin-1',
    });

    expect(repo.setComplianceNote).toHaveBeenCalledWith('user-1', 'watchlist hit');
    expect(detail.complianceNote).toBe('watchlist hit');
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kyc.note', reason: 'watchlist hit' }),
    );
  });
});

describe('kycService.complianceSummary', () => {
  it('aggregates real counts and computes the rejection rate', async () => {
    repo.countByStatus.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 4 } },
      { status: 'APPROVED', _count: { _all: 6 } },
      { status: 'REJECTED', _count: { _all: 2 } },
      { status: 'NEEDS_MORE_INFO', _count: { _all: 1 } },
    ] as never);
    repo.countPendingOlderThan.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    repo.countHighRiskUsers.mockResolvedValue(5);
    repo.recentKycActions.mockResolvedValue([]);

    const summary = await kycService.complianceSummary({ actorId: 'admin-1' });

    expect(summary.counts).toMatchObject({
      pending: 4,
      approved: 6,
      rejected: 2,
      needsMoreInfo: 1,
    });
    expect(summary.pendingOver24h).toBe(3);
    expect(summary.pendingOver48h).toBe(1);
    expect(summary.highRiskUsers).toBe(5);
    // 2 rejected of 8 decided = 25%.
    expect(summary.rejectionRatePct).toBe(25);
  });

  it('returns a null rejection rate when nothing has been decided', async () => {
    repo.countByStatus.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
    ] as never);
    repo.countPendingOlderThan.mockResolvedValue(0);
    repo.countHighRiskUsers.mockResolvedValue(0);
    repo.recentKycActions.mockResolvedValue([]);

    const summary = await kycService.complianceSummary();
    expect(summary.rejectionRatePct).toBeNull();
  });
});
