import { describe, it, expect } from 'vitest';
import {
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  sessionIdParamSchema,
} from '../../src/modules/auth/auth.validators';

describe('auth password/verification validators', () => {
  it('verifyEmail requires a plausibly-long token', () => {
    expect(() => verifyEmailSchema.parse({ token: 'short' })).toThrow();
    expect(verifyEmailSchema.parse({ token: 'x'.repeat(43) }).token).toHaveLength(43);
  });

  it('forgotPassword lower-cases the email', () => {
    expect(forgotPasswordSchema.parse({ email: 'USER@EXAMPLE.COM' }).email).toBe(
      'user@example.com',
    );
  });

  it('resetPassword enforces password strength', () => {
    expect(() =>
      resetPasswordSchema.parse({ token: 'x'.repeat(43), password: 'weak' }),
    ).toThrow();
    expect(
      resetPasswordSchema.parse({
        token: 'x'.repeat(43),
        password: 'NewStr0ngPass',
      }).password,
    ).toBe('NewStr0ngPass');
  });

  it('changePassword rejects a new password equal to the current one', () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'Str0ngPassword',
        newPassword: 'Str0ngPassword',
      }),
    ).toThrow();
  });

  it('changePassword requires a strong new password', () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'whatever',
        newPassword: 'weak',
      }),
    ).toThrow();
  });

  it('sessionId param must be a UUID', () => {
    expect(() => sessionIdParamSchema.parse({ sessionId: 'not-a-uuid' })).toThrow();
    const id = '11111111-1111-1111-1111-111111111111';
    expect(sessionIdParamSchema.parse({ sessionId: id }).sessionId).toBe(id);
  });
});
