import { describe, expect, it } from 'vitest';
import { REDACTED, redactSensitive } from '../../src/lib/redaction';

describe('redactSensitive', () => {
  it('redacts nested secrets without mutating safe fields', () => {
    const redacted = redactSensitive({
      email: 'user@example.com',
      headers: {
        authorization: 'Bearer secret-token',
      },
      body: {
        password: 'Passw0rd!',
        totp: '123456',
        riskNote: 'safe operational note',
      },
      config: {
        DATABASE_URL: 'postgresql://user:pass@host/db',
        publicBaseUrl: 'https://example.com',
      },
    });

    expect(redacted.email).toBe('user@example.com');
    expect(redacted.headers.authorization).toBe(REDACTED);
    expect(redacted.body.password).toBe(REDACTED);
    expect(redacted.body.totp).toBe(REDACTED);
    expect(redacted.body.riskNote).toBe('safe operational note');
    expect(redacted.config.DATABASE_URL).toBe(REDACTED);
    expect(redacted.config.publicBaseUrl).toBe('https://example.com');
  });

  it('handles circular objects safely', () => {
    const value: { name: string; self?: unknown } = { name: 'root' };
    value.self = value;

    const redacted = redactSensitive(value);

    expect(redacted.self).toBe('[Circular]');
  });
});
