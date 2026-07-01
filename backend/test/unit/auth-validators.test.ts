import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from '../../src/modules/auth/auth.validators';

describe('auth validators', () => {
  it('accepts a strong registration payload and lower-cases email', () => {
    const parsed = registerSchema.parse({
      email: 'USER@Example.COM',
      password: 'Str0ngPassword',
    });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects weak passwords (length + character classes)', () => {
    expect(() =>
      registerSchema.parse({ email: 'a@b.com', password: 'short' }),
    ).toThrow();
    expect(() =>
      registerSchema.parse({ email: 'a@b.com', password: 'alllowercase1' }),
    ).toThrow();
  });

  it('rejects unknown fields (strict schema)', () => {
    expect(() =>
      registerSchema.parse({
        email: 'a@b.com',
        password: 'Str0ngPassword',
        isAdmin: true,
      }),
    ).toThrow();
  });

  it('login requires a non-empty password', () => {
    expect(() => loginSchema.parse({ email: 'a@b.com', password: '' })).toThrow();
  });

  it('login rejects an over-long password before it can reach the hasher (DoS guard)', () => {
    expect(() =>
      loginSchema.parse({ email: 'a@b.com', password: 'x'.repeat(129) }),
    ).toThrow();
    // A password at the policy maximum is still accepted.
    expect(
      loginSchema.parse({ email: 'a@b.com', password: 'x'.repeat(128) })
        .password,
    ).toHaveLength(128);
  });

  it('refresh requires a plausibly-long token', () => {
    expect(() => refreshSchema.parse({ refreshToken: 'tiny' })).toThrow();
    expect(
      refreshSchema.parse({ refreshToken: 'x'.repeat(40) }).refreshToken,
    ).toHaveLength(40);
  });
});
