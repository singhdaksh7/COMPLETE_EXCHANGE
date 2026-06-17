import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { config } from '../../src/config';
import { getKycProvider } from '../../src/modules/kyc/providers';
import { kycMockProvider } from '../../src/modules/kyc/providers/kyc.mock';
import { kycExternalProvider } from '../../src/modules/kyc/providers/kyc.external';

function sign(rawBody: string): string {
  return createHmac('sha256', config.kyc.webhookSecret).update(rawBody).digest('hex');
}

describe('KYC provider factory', () => {
  it('resolves the mock provider under the default (mock) setting', () => {
    expect(config.kyc.provider).toBe('mock');
    expect(getKycProvider()).toBe(kycMockProvider);
    expect(kycMockProvider.name).toBe('kyc-mock');
  });

  it('external provider stub throws loudly on every method', async () => {
    await expect(kycExternalProvider.createKycSession({ userId: 'u1' })).rejects.toThrow(
      /not implemented/i,
    );
    await expect(
      kycExternalProvider.getStatus({ providerSessionId: 's', providerApplicantId: null }),
    ).rejects.toThrow(/not implemented/i);
  });
});

describe('mock KYC provider', () => {
  it('creates an opaque session against a non-routable host with no raw PII', async () => {
    const session = await kycMockProvider.createKycSession({ userId: 'user-1' });
    expect(session.provider).toBe('mock');
    expect(session.providerSessionId).toMatch(/^sess_[0-9a-f]+$/);
    expect(session.providerApplicantId).toMatch(/^appl_[0-9a-f]+$/);
    expect(session.redirectUrl).toContain('mock.local');
    expect(session.expiresIn).toBeGreaterThan(0);
    // The opaque ids must not embed the raw user id.
    expect(session.providerSessionId).not.toContain('user-1');
  });

  it('getStatus returns a normalized, PII-free approved result', async () => {
    const result = await kycMockProvider.getStatus({
      providerSessionId: 'sess_x',
      providerApplicantId: 'appl_x',
    });
    expect(result.status).toBe('APPROVED');
    expect(result.livenessStatus).toBe('PASS');
    expect(result.documentStatus).toBe('PASS');
    expect(result.panMasked).toBeNull();
    expect(result.aadhaarMasked).not.toContain('1234567');
  });

  it('verifyWebhook rejects a missing or invalid signature', async () => {
    const rawBody = JSON.stringify({ eventId: 'evt_1' });
    expect(await kycMockProvider.verifyWebhook({ rawBody, signature: undefined, eventId: undefined, body: {} })).toBeNull();
    expect(
      await kycMockProvider.verifyWebhook({
        rawBody,
        signature: 'deadbeef',
        eventId: undefined,
        body: {},
      }),
    ).toBeNull();
  });

  it('verifyWebhook accepts a valid signature and normalizes the event', async () => {
    const body = {
      eventId: 'evt_42',
      eventType: 'kyc.status',
      providerApplicantId: 'appl_x',
      result: { status: 'APPROVED', livenessStatus: 'PASS', documentStatus: 'PASS', riskScore: 3 },
    };
    const rawBody = JSON.stringify(body);
    const event = await kycMockProvider.verifyWebhook({
      rawBody,
      signature: sign(rawBody),
      eventId: undefined,
      body,
    });
    expect(event).not.toBeNull();
    expect(event?.providerEventId).toBe('evt_42');
    expect(event?.providerApplicantId).toBe('appl_x');
    expect(event?.result.status).toBe('APPROVED');
    expect(event?.result.riskScore).toBe(3);
  });
});
