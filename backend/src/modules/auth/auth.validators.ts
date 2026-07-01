import { z } from 'zod';

/**
 * zod schemas = the single source of validation truth for the auth module.
 * Types are inferred from these so validators and TS types never drift.
 */
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

const email = z.string().email().toLowerCase().trim();

/**
 * Optional consented browser geolocation captured at login (Stage 7B). It is a
 * security/audit signal, not a fraud control. Coordinates are range-checked
 * here and rounded to reduced precision server-side before storage.
 */
const loginLocation = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(1_000_000).optional(),
  })
  .strict()
  .optional();

// Opaque tokens are 32 random bytes in base64url (≈43 chars). Be lenient on the
// upper bound but reject anything implausibly short.
const opaqueToken = z.string().min(16, 'Invalid token').max(512);

export const registerSchema = z
  .object({
    email,
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number')
      .optional(),
    password,
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Password is required'),
    location: loginLocation,
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(20, 'Invalid refresh token'),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: opaqueToken,
  })
  .strict();

export const resendVerificationSchema = z
  .object({
    email,
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: opaqueToken,
    password,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current password',
    path: ['newPassword'],
  });

export const sessionIdParamSchema = z
  .object({
    sessionId: z.string().uuid('Invalid session id'),
  })
  .strict();

export const oauthExchangeSchema = z
  .object({
    code: z.string().min(16, 'Invalid code').max(512),
  })
  .strict();

// Second step of a 2FA-gated login: the challenge token from the login response
// + a current TOTP code or a one-time backup code.
export const verify2faSchema = z
  .object({
    challengeToken: opaqueToken,
    code: z.string().trim().min(6, 'Invalid code').max(32),
    // The 2FA second step issues the real session, so it carries the location
    // too (the client re-sends what it captured at the password step).
    location: loginLocation,
  })
  .strict();

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type SessionIdParamDto = z.infer<typeof sessionIdParamSchema>;
export type OAuthExchangeDto = z.infer<typeof oauthExchangeSchema>;
