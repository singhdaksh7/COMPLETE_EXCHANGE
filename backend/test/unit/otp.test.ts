import { describe, it, expect } from 'vitest';
import { generateOtpCode, hashOtp, verifyOtp } from '../../src/lib/otp';

/**
 * Email-OTP crypto primitives (Stage 3A). Pure functions — no DB / Redis / SES.
 */
describe('OTP generation', () => {
  it('always produces a zero-padded 6-digit code', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(code.length).toBe(6);
    }
  });

  it('is drawn from a wide range (not constant)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateOtpCode());
    expect(seen.size).toBeGreaterThan(150);
  });
});

describe('OTP hashing + verification', () => {
  const email = 'user@example.com';
  const code = '123456';

  it('hashes deterministically for the same email + code', () => {
    expect(hashOtp(email, code)).toBe(hashOtp(email, code));
  });

  it('never returns the plaintext code', () => {
    const h = hashOtp(email, code);
    expect(h).not.toContain(code);
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it('binds the hash to the email (same code, different email → different hash)', () => {
    expect(hashOtp(email, code)).not.toBe(hashOtp('other@example.com', code));
  });

  it('verifies a correct code', () => {
    const stored = hashOtp(email, code);
    expect(verifyOtp(email, code, stored)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const stored = hashOtp(email, code);
    expect(verifyOtp(email, '000000', stored)).toBe(false);
  });

  it('rejects a correct code presented for a different email', () => {
    const stored = hashOtp(email, code);
    expect(verifyOtp('attacker@example.com', code, stored)).toBe(false);
  });

  it('is case-insensitive on the email (normalized)', () => {
    const stored = hashOtp('User@Example.com', code);
    expect(verifyOtp('user@example.com', code, stored)).toBe(true);
  });
});
