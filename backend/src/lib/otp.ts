import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

/**
 * Email-OTP crypto helpers (Stage 3A).
 *
 * The OTP code is a 6-digit number drawn from a CSPRNG. It is NEVER stored or
 * logged in production; only a keyed HMAC-SHA256 (server secret + email) is
 * persisted. Binding the email into the MAC means a hash captured for one
 * address can't be replayed against another, and the server secret makes an
 * offline brute force of the (small) 6-digit space impossible without it.
 */

const OTP_DIGITS = 6;
const OTP_MAX_EXCLUSIVE = 10 ** OTP_DIGITS; // 1_000_000

/** Cryptographically-strong 6-digit code, left-zero-padded ("000123"). */
export function generateOtpCode(): string {
  return String(randomInt(0, OTP_MAX_EXCLUSIVE)).padStart(OTP_DIGITS, '0');
}

/** Keyed HMAC of a code, bound to the email. Stored as the `otpHash`. */
export function hashOtp(email: string, code: string): string {
  return createHmac('sha256', config.otp.hashSecret)
    .update(`${email.toLowerCase()}:${code}`)
    .digest('hex');
}

/**
 * Constant-time check that `code` matches a stored hash for `email`. Compares
 * the two hex digests with timingSafeEqual so a wrong code never leaks how many
 * leading characters were correct via response timing.
 */
export function verifyOtp(email: string, code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashOtp(email, code));
  const expected = Buffer.from(storedHash);
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
