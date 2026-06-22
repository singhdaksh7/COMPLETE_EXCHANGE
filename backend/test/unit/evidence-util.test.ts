import { describe, it, expect } from 'vitest';
import { stripSecrets, canonicalize, checksumOf, REDACTED, REDACTED_BINARY } from '../../src/modules/compliance/evidence.util';

describe('stripSecrets', () => {
  it('redacts denied keys (password, secret, totp, tokens, db url, encrypted PII)', () => {
    const out = stripSecrets({
      email: 'u@example.com',
      passwordHash: 'argon2...',
      totpSecretEnc: 'xxx',
      jwtSecret: 'sk_live',
      databaseUrl: 'postgres://...',
      panEnc: 'enc',
      aadhaarRefEnc: 'enc2',
      accessToken: 'at',
      nested: { apiKey: 'k', keep: 'ok' },
    }) as Record<string, unknown>;
    expect(out.email).toBe('u@example.com');
    expect(out.passwordHash).toBe(REDACTED);
    expect(out.totpSecretEnc).toBe(REDACTED);
    expect(out.jwtSecret).toBe(REDACTED);
    expect(out.databaseUrl).toBe(REDACTED);
    expect(out.panEnc).toBe(REDACTED);
    expect(out.aadhaarRefEnc).toBe(REDACTED);
    expect(out.accessToken).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).apiKey).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).keep).toBe('ok');
  });

  it('redacts binary (Buffer / Uint8Array) values regardless of key', () => {
    const out = stripSecrets({ blob: Buffer.from('abc'), arr: new Uint8Array([1, 2, 3]) }) as Record<string, unknown>;
    expect(out.blob).toBe(REDACTED_BINARY);
    expect(out.arr).toBe(REDACTED_BINARY);
  });

  it('keeps masked values (panMasked) untouched', () => {
    const out = stripSecrets({ panMasked: 'ABCDE****F', aadhaarMasked: 'XXXX XXXX 1234' }) as Record<string, unknown>;
    expect(out.panMasked).toBe('ABCDE****F');
    expect(out.aadhaarMasked).toBe('XXXX XXXX 1234');
  });

  it('handles arrays and dates', () => {
    const d = new Date('2026-06-22T00:00:00.000Z');
    const out = stripSecrets({ list: [{ secret: 's', ok: 1 }], when: d }) as Record<string, unknown>;
    expect((out.list as Array<Record<string, unknown>>)[0].secret).toBe(REDACTED);
    expect((out.list as Array<Record<string, unknown>>)[0].ok).toBe(1);
    expect(out.when).toBe(d.toISOString());
  });
});

describe('canonicalize + checksumOf', () => {
  it('is order-independent (stable checksum)', () => {
    const a = { b: 1, a: 2, c: [3, { y: 1, x: 2 }] };
    const b = { c: [3, { x: 2, y: 1 }], a: 2, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(checksumOf(a)).toBe(checksumOf(b));
  });

  it('produces a 64-char hex SHA-256', () => {
    const h = checksumOf({ hello: 'world' });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when content changes', () => {
    expect(checksumOf({ a: 1 })).not.toBe(checksumOf({ a: 2 }));
  });
});
