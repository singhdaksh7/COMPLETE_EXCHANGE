import { describe, it, expect } from 'vitest';
import { mockDigiLockerProvider } from '../../src/modules/kyc/providers/digilocker.mock';
import { getDigiLockerProvider } from '../../src/modules/kyc/providers';

describe('mock DigiLocker provider', () => {
  it('is the provider resolved by the factory under the mock setting', () => {
    expect(getDigiLockerProvider()).toBe(mockDigiLockerProvider);
    expect(mockDigiLockerProvider.name).toBe('digilocker-mock');
  });

  it('creates an opaque consent session against a non-routable host', async () => {
    const session = await mockDigiLockerProvider.createSession({
      userId: 'user-1',
    });
    expect(session.provider).toBe('digilocker');
    expect(session.providerRef).toMatch(/^dl_[0-9a-f]+$/);
    expect(session.authorizationUrl).toContain(session.providerRef);
    expect(session.authorizationUrl).toContain('mock.local');
    expect(session.expiresIn).toBeGreaterThan(0);
    // The opaque ref must not embed the raw user id.
    expect(session.providerRef).not.toContain('user-1');
  });

  it('returns only secure storage keys and hashes — never PII or public URLs', async () => {
    const docs = await mockDigiLockerProvider.fetchIssuedDocuments({
      userId: 'user-1',
      providerRef: 'dl_abc123',
    });
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.storageKey.startsWith('kyc/digilocker/')).toBe(true);
      // Storage keys are NOT public URLs.
      expect(doc.storageKey.startsWith('http')).toBe(false);
      expect(doc.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(doc.docType).toBeTruthy();
    }
  });
});
