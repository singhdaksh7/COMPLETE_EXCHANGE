import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verify2faSchema,
} from '../../src/modules/auth/auth.validators';

describe('auth validators', () => {
  const consent = {
    termsOfService: true,
    privacyPolicy: true,
    riskDisclosure: true,
  } as const;

  it('accepts a strong registration payload and lower-cases email', () => {
    const parsed = registerSchema.parse({
      email: 'USER@Example.COM',
      password: 'Str0ngPassword',
      acceptedPolicies: consent,
    });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects weak passwords (length + character classes)', () => {
    expect(() =>
      registerSchema.parse({ email: 'a@b.com', password: 'short', acceptedPolicies: consent }),
    ).toThrow();
    expect(() =>
      registerSchema.parse({ email: 'a@b.com', password: 'alllowercase1', acceptedPolicies: consent }),
    ).toThrow();
  });

  it('rejects unknown fields (strict schema)', () => {
    expect(() =>
      registerSchema.parse({
        email: 'a@b.com',
        password: 'Str0ngPassword',
        acceptedPolicies: consent,
        isAdmin: true,
      }),
    ).toThrow();
  });

  it('rejects signup without policy consent (Stage 9A)', () => {
    // Missing entirely.
    expect(() =>
      registerSchema.parse({ email: 'a@b.com', password: 'Str0ngPassword' }),
    ).toThrow();
    // Any required flag not literally true.
    expect(() =>
      registerSchema.parse({
        email: 'a@b.com',
        password: 'Str0ngPassword',
        acceptedPolicies: { ...consent, riskDisclosure: false },
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

  /**
   * `location` is `.optional()`, not `.nullable()` — it must be either a
   * valid {latitude, longitude, accuracy?} object or absent entirely. A mobile
   * client that sends an explicit `location: null` (e.g. before permission is
   * granted) fails here with a generic VALIDATION_ERROR, before the
   * LOCATION_REQUIRED business check in auth.service ever runs. This locks in
   * the contract so a client-side regression is caught by a schema change,
   * not by a support ticket.
   */
  describe('login location contract (undefined-absent, not nullable)', () => {
    const base = { email: 'a@b.com', password: 'x' };

    it('accepts a login with no location field at all', () => {
      expect(loginSchema.safeParse(base).success).toBe(true);
    });

    it('accepts a login with a valid {latitude, longitude, accuracy} location', () => {
      const result = loginSchema.safeParse({
        ...base,
        location: { latitude: 12.9716, longitude: 77.5946, accuracy: 15 },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an explicit location: null (must be omitted, not nulled)', () => {
      const result = loginSchema.safeParse({ ...base, location: null });
      expect(result.success).toBe(false);
    });

    it('rejects a location object with extra fields (strict)', () => {
      const result = loginSchema.safeParse({
        ...base,
        location: { latitude: 1, longitude: 1, accuracy: 1, altitude: 5 },
      });
      expect(result.success).toBe(false);
    });

    it('verify2faSchema has the same undefined-only location contract', () => {
      const okAbsent = verify2faSchema.safeParse({
        challengeToken: 'x'.repeat(20),
        code: '123456',
      });
      expect(okAbsent.success).toBe(true);

      const okPresent = verify2faSchema.safeParse({
        challengeToken: 'x'.repeat(20),
        code: '123456',
        location: { latitude: 1, longitude: 1, accuracy: 1 },
      });
      expect(okPresent.success).toBe(true);

      const rejectsNull = verify2faSchema.safeParse({
        challengeToken: 'x'.repeat(20),
        code: '123456',
        location: null,
      });
      expect(rejectsNull.success).toBe(false);
    });
  });
});
