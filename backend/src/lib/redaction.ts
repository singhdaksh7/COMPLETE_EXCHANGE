const SECRET_KEY_PATTERN =
  /authorization|cookie|password|passcode|secret|token|otp|totp|private.?key|database_url|redis_url|access.?key|api.?key|key_secret|webhook_secret/i;

export const REDACTED = '[REDACTED]';

export function isSensitiveKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactSensitive<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return REDACTED as T;
  if (seen.has(value)) return '[Circular]' as T;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen)) as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactSensitive(item, seen);
  }
  return out as T;
}
