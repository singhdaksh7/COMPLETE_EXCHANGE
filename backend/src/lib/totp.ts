import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Shared TOTP (RFC 6238) utility — used by the user 2FA module.
 *
 * Pure crypto, no I/O. SHA-1, 30-second period, 6 digits — the configuration
 * every standard authenticator app (Google Authenticator, Authy, 1Password)
 * expects. Verification allows a small ±1 step clock skew and compares codes in
 * constant time. This module never touches the database and never logs a secret.
 *
 * The base32 SECRET produced here is sealed with the AES-256-GCM PII helper
 * before it is persisted (see the security module) — it is never stored in
 * plaintext.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_MS = 30_000;
const DIGITS = 6;

/** RFC 4648 base32 (no padding) — the form authenticator apps expect. */
function base32Encode(buf: Buffer): string {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[Number.parseInt(bits.slice(i, i + 5), 2)];
  }
  const rem = bits.length % 5;
  if (rem !== 0) {
    out += BASE32_ALPHABET[Number.parseInt(bits.slice(-rem).padEnd(5, '0'), 2)];
  }
  return out;
}

/** Normalize a user/stored base32 string (strip spaces/padding, upper-case). */
export function normalizeBase32(input: string): string {
  return input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
}

function base32ToBuffer(input: string): Buffer {
  let bits = '';
  for (const char of normalizeBase32(input)) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) return Buffer.alloc(0);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Fresh base32 TOTP secret (160 bits of CSPRNG entropy). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Compute the 6-digit TOTP code for a base32 secret at a given time. */
export function totpCode(secretBase32: string, timestamp = Date.now()): string {
  const secret = base32ToBuffer(secretBase32);
  if (secret.length === 0) return '';
  const counter = Math.floor(timestamp / PERIOD_MS);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Verify a presented code against a base32 secret, allowing ±1 step (±30s) of
 * clock skew. Comparison is constant-time so a wrong code never leaks how many
 * leading digits matched.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  timestamp = Date.now(),
): boolean {
  const candidate = (code ?? '').trim();
  if (!/^\d{6}$/.test(candidate)) return false;
  const secret = base32ToBuffer(secretBase32);
  if (secret.length === 0) return false;
  const presented = Buffer.from(candidate);
  for (const skew of [-PERIOD_MS, 0, PERIOD_MS]) {
    const expected = Buffer.from(totpCode(secretBase32, timestamp + skew));
    if (
      expected.length === presented.length &&
      timingSafeEqual(presented, expected)
    ) {
      return true;
    }
  }
  return false;
}

/** Build the otpauth:// URI an authenticator app scans from a QR code. */
export function otpauthUri(params: {
  secret: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const issuer = encodeURIComponent(params.issuer);
  return (
    `otpauth://totp/${label}` +
    `?secret=${params.secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=30`
  );
}
