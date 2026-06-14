import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { config } from '../config';

/**
 * Symmetric encryption for KYC PII at rest (PAN, tokenized Aadhaar ref).
 *
 * The frozen schema stores these as `Bytes` (panEnc / aadhaarRefEnc) — never as
 * plaintext columns — so they must be sealed before they reach Prisma. We use
 * AES-256-GCM (authenticated encryption): a tampered ciphertext fails to decrypt
 * rather than silently returning garbage.
 *
 * Layout of the returned buffer:  iv(12) ‖ authTag(16) ‖ ciphertext
 *
 * The data-encryption key is derived from a configured secret via scrypt. In
 * production that secret MUST be a strong, externally-managed key (KMS-wrapped);
 * the dev default exists only so local/test runs work out of the box.
 *
 * SECURITY: callers must never log the plaintext that flows through here.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | undefined;
function key(): Buffer {
  if (!cachedKey) {
    // Static salt keeps the derived key stable across restarts so previously
    // sealed rows remain decryptable. Rotating the underlying secret is a
    // deliberate, envelope-rewrap operation (out of scope for this module).
    cachedKey = scryptSync(config.kyc.encryptionKey, 'cex.kyc.pii.v1', 32);
  }
  return cachedKey;
}

/** Seal a UTF-8 string into an authenticated ciphertext buffer. */
export function encryptPII(plaintext: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Open a buffer previously produced by {@link encryptPII}. Throws if tampered. */
export function decryptPII(payload: Buffer): string {
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    'utf8',
  );
}
