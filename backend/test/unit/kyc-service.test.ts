import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KycDocument, KycProfile } from '@prisma/client';

vi.mock('../../src/modules/kyc/kyc.repository', () => ({
  kycRepository: {
    findUserById: vi.fn(),
    findProfileByUserId: vi.fn(),
    submitProfile: vi.fn(),
    createDocument: vi.fn(),
    listDocumentsByUser: vi.fn(),
    listPendingProfiles: vi.fn(),
    decide: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

// Notifications are a fire-and-forget side effect; stub them in the unit test.
vi.mock('../../src/modules/notification/notification.service', () => ({
  notificationService: { notifyUser: vi.fn(), notifyAdmins: vi.fn() },
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
    address: null,
    status: 'PENDING',
    provider: 'digilocker',
    providerRef: 'dl_ref',
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
    expect(result.digilocker.authorizationUrl).toContain('mock.local');

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
});
