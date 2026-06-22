import { createHash } from 'node:crypto';

/**
 * Defense-in-depth sanitization + checksum helpers for Stage 5.4 evidence packs.
 *
 * Even though the assembly layer only ever pulls masked DTOs, `stripSecrets`
 * runs over the whole pack payload as a final guard so a secret can NEVER leak
 * into an evidence pack — regardless of upstream changes. It redacts keys whose
 * name matches a denylist and any binary (Bytes/Buffer) values (e.g. encrypted
 * PAN/Aadhaar blobs).
 */

export const REDACTED = '[REDACTED]';
export const REDACTED_BINARY = '[REDACTED_BINARY]';

/** Substrings (lowercased key match) that must never appear in a pack. */
const DENY_KEY_SUBSTRINGS = [
  'password',
  'passwordhash',
  'secret',
  'totp',
  'privatekey',
  'private_key',
  'mnemonic',
  'jwt',
  'apikey',
  'api_key',
  'credential',
  'accesstoken',
  'refreshtoken',
  'dburl',
  'databaseurl',
  'connectionstring',
  'panenc',
  'aadhaarref',
  'aadhaarenc',
  'rawpan',
  'rawaadhaar',
];

function isDenied(key: string): boolean {
  const k = key.toLowerCase();
  return DENY_KEY_SUBSTRINGS.some((d) => k.includes(d));
}

/** Recursively clone `value`, redacting denied keys + binary values. */
export function stripSecrets(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return REDACTED_BINARY;
  if (value instanceof Uint8Array) return REDACTED_BINARY;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isDenied(k) ? REDACTED : stripSecrets(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

/** Stable JSON (sorted keys) so checksums are deterministic. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex over the canonical form of a value (tamper-evidence). */
export function checksumOf(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
