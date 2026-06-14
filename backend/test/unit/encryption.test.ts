import { describe, it, expect } from 'vitest';
import { encryptPII, decryptPII } from '../../src/lib/encryption';

describe('encryption (KYC PII at rest)', () => {
  it('round-trips a value through encrypt/decrypt', () => {
    const plaintext = 'ABCDE1234F';
    const sealed = encryptPII(plaintext);
    expect(Buffer.isBuffer(sealed)).toBe(true);
    expect(decryptPII(sealed)).toBe(plaintext);
  });

  it('never stores the plaintext in the ciphertext buffer', () => {
    const plaintext = 'ABCDE1234F';
    const sealed = encryptPII(plaintext);
    expect(sealed.toString('utf8')).not.toContain(plaintext);
    expect(sealed.length).toBeGreaterThan(plaintext.length);
  });

  it('produces a fresh IV per call (same input -> different ciphertext)', () => {
    const a = encryptPII('same-input');
    const b = encryptPII('same-input');
    expect(a.equals(b)).toBe(false);
    expect(decryptPII(a)).toBe('same-input');
    expect(decryptPII(b)).toBe('same-input');
  });

  it('rejects a tampered ciphertext (GCM auth tag fails)', () => {
    const sealed = encryptPII('tamper-me');
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => decryptPII(sealed)).toThrow();
  });
});
