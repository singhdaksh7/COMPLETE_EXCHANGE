import { describe, it, expect } from 'vitest';
import {
  federatedLinkConfirmSchema,
  federatedLoginSchema,
  federatedRegisterCompleteSchema,
} from '../../src/modules/auth/auth.federated.validators';

/**
 * Stage 12A Goal 6 — "prevent provider switching" / "prevent identity
 * mismatch" is enforced structurally: the link/confirm and register/complete
 * endpoints never accept a fresh idToken or a client-asserted provider at
 * all — the identity is entirely bound to what was verified and stored in
 * the challenge at /auth/federated/firebase time. These `.strict()` schemas
 * are what make that true at the HTTP boundary; this test locks it in.
 */
describe('federated challenge-redemption schemas reject provider/identity fields', () => {
  it('federatedLinkConfirmSchema rejects an extraneous idToken', () => {
    const result = federatedLinkConfirmSchema.safeParse({
      challengeToken: 'x'.repeat(20),
      otp: '123456',
      idToken: 'attacker-supplied-token',
    });
    expect(result.success).toBe(false);
  });

  it('federatedLinkConfirmSchema rejects an extraneous provider field', () => {
    const result = federatedLinkConfirmSchema.safeParse({
      challengeToken: 'x'.repeat(20),
      otp: '123456',
      provider: 'APPLE',
    });
    expect(result.success).toBe(false);
  });

  it('federatedRegisterCompleteSchema rejects an extraneous idToken', () => {
    const result = federatedRegisterCompleteSchema.safeParse({
      challengeToken: 'x'.repeat(20),
      phone: '+919999999999',
      acceptedPolicies: { termsOfService: true, privacyPolicy: true, riskDisclosure: true },
      idToken: 'attacker-supplied-token',
    });
    expect(result.success).toBe(false);
  });

  it('federatedRegisterCompleteSchema rejects an extraneous provider field', () => {
    const result = federatedRegisterCompleteSchema.safeParse({
      challengeToken: 'x'.repeat(20),
      phone: '+919999999999',
      acceptedPolicies: { termsOfService: true, privacyPolicy: true, riskDisclosure: true },
      provider: 'GOOGLE',
    });
    expect(result.success).toBe(false);
  });

  it('federatedRegisterCompleteSchema rejects non-literal-true policy flags', () => {
    const result = federatedRegisterCompleteSchema.safeParse({
      challengeToken: 'x'.repeat(20),
      phone: '+919999999999',
      acceptedPolicies: { termsOfService: true, privacyPolicy: false, riskDisclosure: true },
    });
    expect(result.success).toBe(false);
  });
});

/**
 * federatedLoginSchema shares the exact same `location` contract as
 * loginSchema (see auth-validators.test.ts): `.optional()`, not `.nullable()`.
 * This is the schema behind /auth/federated/firebase (mobile Google/Apple
 * sign-in) — a client sending `location: null` fails with a generic
 * VALIDATION_ERROR here, the same way it does on plain email/password login,
 * which is why both mobile auth flows were showing the identical
 * "Request validation failed" error.
 */
describe('federatedLoginSchema location contract (undefined-absent, not nullable)', () => {
  const base = { idToken: 'x'.repeat(20), provider: 'GOOGLE' as const };

  it('accepts a federated login with no location field at all', () => {
    expect(federatedLoginSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a federated login with a valid location object', () => {
    const result = federatedLoginSchema.safeParse({
      ...base,
      location: { latitude: 12.9716, longitude: 77.5946, accuracy: 15 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an explicit location: null (must be omitted, not nulled)', () => {
    const result = federatedLoginSchema.safeParse({ ...base, location: null });
    expect(result.success).toBe(false);
  });

  it('confirms the provider enum is uppercase GOOGLE/APPLE, matching the mobile client', () => {
    expect(federatedLoginSchema.safeParse({ ...base, provider: 'google' }).success).toBe(false);
    expect(federatedLoginSchema.safeParse({ ...base, provider: 'APPLE' }).success).toBe(true);
  });
});
