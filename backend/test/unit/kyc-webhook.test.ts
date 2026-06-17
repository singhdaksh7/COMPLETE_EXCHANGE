import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KycProfile } from '@prisma/client';
import type { KycWebhookEvent } from '../../src/modules/kyc/providers';

vi.mock('../../src/modules/kyc/kyc.repository', () => ({
  kycRepository: {
    findUserById: vi.fn(),
    findProfileByUserId: vi.fn(),
    findProfileByProviderRef: vi.fn(),
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

// Controllable provider behind the generic seam.
const verifyWebhook = vi.fn();
vi.mock('../../src/modules/kyc/providers', async (orig) => {
  const actual = await orig<typeof import('../../src/modules/kyc/providers')>();
  return {
    ...actual,
    getKycProvider: () => ({
      name: 'kyc-mock',
      createKycSession: vi.fn(),
      submitDocuments: vi.fn(),
      getStatus: vi.fn(),
      verifyWebhook,
    }),
  };
});

import { kycRepository } from '../../src/modules/kyc/kyc.repository';
import { kycService } from '../../src/modules/kyc/kyc.service';

const repo = vi.mocked(kycRepository);

function makeProfile(over: Partial<KycProfile> = {}): KycProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    status: 'PENDING',
    provider: 'kyc-mock',
    providerRef: 'sess_1',
    providerSessionId: 'sess_1',
    providerApplicantId: 'appl_1',
    panMasked: null,
    aadhaarMasked: null,
    livenessStatus: null,
    documentStatus: null,
    riskScore: null,
    rejectedReason: null,
    reviewedBy: null,
    reviewedAt: null,
    fullName: 'Jane',
    dob: new Date(),
    panEnc: Buffer.alloc(0),
    aadhaarRefEnc: null,
    address: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as KycProfile;
}

function makeEvent(over: Partial<KycWebhookEvent> = {}): KycWebhookEvent {
  return {
    providerEventId: 'evt_1',
    eventType: 'kyc.status',
    providerSessionId: 'sess_1',
    providerApplicantId: 'appl_1',
    result: {
      status: 'APPROVED',
      livenessStatus: 'PASS',
      documentStatus: 'PASS',
      riskScore: 4,
      rejectionReason: null,
      panMasked: null,
      aadhaarMasked: 'XXXXXXXX1234',
    },
    ...over,
  };
}

const input = {
  rawBody: JSON.stringify({ eventId: 'evt_1' }),
  signature: 'sig',
  eventId: 'evt_1',
  body: { eventId: 'evt_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('kycService.handleWebhook', () => {
  it('rejects a missing raw body', async () => {
    await expect(
      kycService.handleWebhook({ ...input, rawBody: undefined }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an invalid signature without persisting an event', async () => {
    verifyWebhook.mockResolvedValue(null);
    await expect(kycService.handleWebhook(input)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repo.createWebhookEvent).not.toHaveBeenCalled();
    expect(repo.applyProviderUpdate).not.toHaveBeenCalled();
  });

  it('processes a valid new event and applies the provider result', async () => {
    verifyWebhook.mockResolvedValue(makeEvent());
    repo.findWebhookEvent.mockResolvedValue(null);
    repo.createWebhookEvent.mockResolvedValue({} as never);
    repo.findProfileByProviderRef.mockResolvedValue(makeProfile({ status: 'PENDING' }));
    repo.applyProviderUpdate.mockResolvedValue(makeProfile({ status: 'APPROVED' }));
    repo.markWebhookProcessed.mockResolvedValue({} as never);

    const res = await kycService.handleWebhook(input);

    expect(res.status).toBe('processed');
    expect(repo.createWebhookEvent).toHaveBeenCalledOnce();
    // PENDING -> APPROVED is legal: status changes and tier is granted.
    const applyArg = repo.applyProviderUpdate.mock.calls[0][1];
    expect(applyArg).toMatchObject({ status: 'APPROVED', changeStatus: true });
    expect(applyArg.tier).toBeGreaterThanOrEqual(1);
    expect(repo.markWebhookProcessed).toHaveBeenCalledWith('kyc-mock', 'evt_1');
  });

  it('is idempotent: a duplicate processed event is a no-op', async () => {
    verifyWebhook.mockResolvedValue(makeEvent());
    repo.findWebhookEvent.mockResolvedValue({
      id: 'we-1',
      processedAt: new Date(),
    } as never);

    const res = await kycService.handleWebhook(input);

    expect(res.status).toBe('duplicate');
    expect(repo.createWebhookEvent).not.toHaveBeenCalled();
    expect(repo.applyProviderUpdate).not.toHaveBeenCalled();
    expect(repo.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('ignores an event that maps to no known profile but still marks it processed', async () => {
    verifyWebhook.mockResolvedValue(makeEvent());
    repo.findWebhookEvent.mockResolvedValue(null);
    repo.createWebhookEvent.mockResolvedValue({} as never);
    repo.findProfileByProviderRef.mockResolvedValue(null);
    repo.markWebhookProcessed.mockResolvedValue({} as never);

    const res = await kycService.handleWebhook(input);

    expect(res.status).toBe('ignored');
    expect(repo.applyProviderUpdate).not.toHaveBeenCalled();
    expect(repo.markWebhookProcessed).toHaveBeenCalledWith('kyc-mock', 'evt_1');
  });

  it('rejects an illegal provider-driven transition (APPROVED -> REJECTED)', async () => {
    verifyWebhook.mockResolvedValue(makeEvent({ result: { ...makeEvent().result, status: 'REJECTED' } }));
    repo.findWebhookEvent.mockResolvedValue(null);
    repo.createWebhookEvent.mockResolvedValue({} as never);
    repo.findProfileByProviderRef.mockResolvedValue(makeProfile({ status: 'APPROVED' }));

    await expect(kycService.handleWebhook(input)).rejects.toMatchObject({
      errorCode: 'KYC_INVALID_TRANSITION',
    });
    expect(repo.applyProviderUpdate).not.toHaveBeenCalled();
  });
});
