import { describe, it, expect } from 'vitest';
import {
  generateTotpSecret,
  totpCode,
  verifyTotp,
  otpauthUri,
} from '../../src/lib/totp';

describe('lib/totp', () => {
  it('generates a base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });

  it('verifies a freshly generated code (round-trip)', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = totpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, now)).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const good = totpCode(secret, now);
    const bad = good === '000000' ? '000001' : '000000';
    expect(verifyTotp(secret, bad, now)).toBe(false);
  });

  it('accepts a code from the previous step (±1 clock skew)', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const prevStepCode = totpCode(secret, now - 30_000);
    expect(verifyTotp(secret, prevStepCode, now)).toBe(true);
  });

  it('rejects a code two steps away (outside the skew window)', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const farCode = totpCode(secret, now - 90_000);
    // It is astronomically unlikely (but not impossible) for two distant steps
    // to collide; guard the assertion so the test is deterministic.
    if (farCode !== totpCode(secret, now)) {
      expect(verifyTotp(secret, farCode, now)).toBe(false);
    }
  });

  it('rejects malformed codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '', Date.now())).toBe(false);
    expect(verifyTotp(secret, 'abcdef', Date.now())).toBe(false);
    expect(verifyTotp(secret, '12345', Date.now())).toBe(false);
  });

  it('builds a standards-compliant otpauth URI', () => {
    const uri = otpauthUri({
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'user@example.com',
      issuer: 'EXORA',
    });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=EXORA');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
