import { describe, it, expect } from 'vitest';
import { mockKycProvider, signKycWebhook } from '../../src/modules/kyc/providers/kyc.mock';
import { getKycProvider } from '../../src/modules/kyc/providers';

/**
 * Mock KYC verification provider (Phase 5.3) — offline, deterministic, no
 * external calls. Covers session creation, raw-body HMAC verification, payload
 * parsing, and provider→canonical status mapping.
 */
describe('mockKycProvider', () => {
  it('is the resolved provider by default', () => {
    expect(getKycProvider()).toBe(mockKycProvider);
    expect(mockKycProvider.name).toBe('kyc-mock');
  });

  it('creates a PENDING session with an opaque ref + mock.local URL', async () => {
    const s = await mockKycProvider.createSession({ userId: 'u1' });
    expect(s.provider).toBe('mock');
    expect(s.providerRef).toMatch(/^kyc_/);
    expect(s.providerStatus).toBe('PENDING');
    expect(s.verificationUrl).toContain('mock.local');
    expect(s.expiresIn).toBeGreaterThan(0);
    // The session carries no PII.
    expect(JSON.stringify(s)).not.toMatch(/pan|aadhaar/i);
  });

  it('verifies a valid HMAC signature and rejects tampered/absent ones', () => {
    const body = JSON.stringify({ providerRef: 'kyc_abc', status: 'VERIFIED' });
    const sig = signKycWebhook(body);
    expect(mockKycProvider.verifySignature(body, sig)).toBe(true);
    expect(mockKycProvider.verifySignature(body, undefined)).toBe(false);
    expect(mockKycProvider.verifySignature(body, 'deadbeef')).toBe(false);
    expect(mockKycProvider.verifySignature(`${body} `, sig)).toBe(false); // body tampered
  });

  it('parses a webhook body into a normalized event', () => {
    const body = JSON.stringify({ providerRef: 'kyc_xyz', status: 'approved' });
    const ev = mockKycProvider.handleWebhook(body);
    expect(ev).toEqual({ providerRef: 'kyc_xyz', status: 'VERIFIED', rawStatus: 'approved' });
    expect(() => mockKycProvider.handleWebhook('{}')).toThrow(/Malformed/);
  });

  it('maps provider status synonyms to the canonical set', () => {
    for (const v of ['VERIFIED', 'approved', 'success', 'COMPLETED']) expect(mockKycProvider.mapProviderStatus(v)).toBe('VERIFIED');
    for (const r of ['REJECTED', 'declined', 'failed']) expect(mockKycProvider.mapProviderStatus(r)).toBe('REJECTED');
    for (const p of ['pending', 'whatever']) expect(mockKycProvider.mapProviderStatus(p)).toBe('PENDING');
  });
});
