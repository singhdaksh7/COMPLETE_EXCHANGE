import { randomBytes, createHash } from 'node:crypto';

/**
 * Opaque single-use tokens (email verification, password reset).
 *
 * The raw token is sent to the user; only its SHA-256 hash is ever stored
 * (in Redis, with a TTL) — exactly like refresh tokens. A leaked store
 * therefore yields no usable tokens.
 */

/** 256 bits of CSPRNG entropy, URL-safe base64 (no padding). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Stable hash used as the Redis key / stored value for a token. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
