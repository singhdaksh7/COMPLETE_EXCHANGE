import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../../../config';
import type {
  KycProvider,
  KycProviderResult,
  KycSession,
  KycWebhookEvent,
  KycWebhookInput,
} from './kyc-provider';

/**
 * Mock KYC provider.
 *
 * Deterministic, fully offline stand-in for a real vendor. It performs NO
 * network calls and fabricates no PII: sessions are opaque references and
 * results carry only masked identifiers + normalized check statuses — exactly
 * the shape a real client would hand back.
 *
 * A non-routable host (`*.mock.local`) is used for the redirect URL so it can
 * never accidentally hit a real endpoint. Webhooks are still HMAC-verified
 * against `KYC_WEBHOOK_SECRET`, so idempotency and signature handling are
 * exercised end-to-end before any vendor is wired.
 */
const REDIRECT_BASE_URL = 'https://kyc-provider.mock.local/verify';
const SESSION_TTL_SEC = 600;

/** Stable, opaque, non-PII reference derived from the user id. */
function opaqueRef(prefix: string, userId: string): string {
  return `${prefix}_${createHash('sha256')
    .update(`${userId}:${randomUUID()}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const kycMockProvider: KycProvider = {
  name: 'kyc-mock',

  async createKycSession({ userId }): Promise<KycSession> {
    return {
      provider: 'mock',
      providerSessionId: opaqueRef('sess', userId),
      providerApplicantId: opaqueRef('appl', userId),
      redirectUrl: `${REDIRECT_BASE_URL}/${opaqueRef('tok', userId)}`,
      expiresIn: SESSION_TTL_SEC,
    };
  },

  async submitDocuments() {
    // The mock accepts any registered document and marks it pending review.
    return { documentStatus: 'PENDING' };
  },

  async getStatus(): Promise<KycProviderResult> {
    // Deterministic happy-path so dev/staging can drive a full approval without
    // a vendor. No raw PII — only a masked Aadhaar sample.
    return {
      status: 'APPROVED',
      livenessStatus: 'PASS',
      documentStatus: 'PASS',
      riskScore: 5,
      rejectionReason: null,
      panMasked: null,
      aadhaarMasked: 'XXXXXXXX1234',
    };
  },

  async verifyWebhook(input: KycWebhookInput): Promise<KycWebhookEvent | null> {
    if (!input.rawBody || !input.signature) return null;

    const expected = createHmac('sha256', config.kyc.webhookSecret)
      .update(input.rawBody)
      .digest('hex');
    if (!constantTimeEquals(expected, input.signature)) return null;

    const body = (input.body ?? {}) as Record<string, unknown>;
    const result = (body.result ?? {}) as Record<string, unknown>;

    const providerEventId =
      (typeof body.eventId === 'string' && body.eventId) ||
      input.eventId ||
      createHash('sha256').update(input.rawBody).digest('hex').slice(0, 32);

    return {
      providerEventId,
      eventType: typeof body.eventType === 'string' ? body.eventType : 'kyc.status',
      providerSessionId:
        typeof body.providerSessionId === 'string' ? body.providerSessionId : null,
      providerApplicantId:
        typeof body.providerApplicantId === 'string'
          ? body.providerApplicantId
          : null,
      result: {
        status: (typeof result.status === 'string'
          ? result.status
          : 'PENDING') as KycProviderResult['status'],
        livenessStatus: (typeof result.livenessStatus === 'string'
          ? result.livenessStatus
          : 'PENDING') as KycProviderResult['livenessStatus'],
        documentStatus: (typeof result.documentStatus === 'string'
          ? result.documentStatus
          : 'PENDING') as KycProviderResult['documentStatus'],
        riskScore: typeof result.riskScore === 'number' ? result.riskScore : null,
        rejectionReason:
          typeof result.rejectionReason === 'string' ? result.rejectionReason : null,
        panMasked: typeof result.panMasked === 'string' ? result.panMasked : null,
        aadhaarMasked:
          typeof result.aadhaarMasked === 'string' ? result.aadhaarMasked : null,
      },
    };
  },
};
