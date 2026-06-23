import { z } from 'zod';

const email = z.string().email().toLowerCase().trim();

// A 6-digit numeric code, kept as a string so a leading zero ("000123") is
// preserved exactly as it was sent.
const otpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'OTP must be a 6-digit code');

export const requestEmailOtpSchema = z
  .object({
    email,
    // Optional client hint only. The server authoritatively derives LOGIN vs
    // SIGNUP from whether the account exists, so this never changes behaviour.
    purpose: z.enum(['LOGIN', 'SIGNUP']).optional(),
  })
  .strict();

export const verifyEmailOtpSchema = z
  .object({
    email,
    otp: otpCode,
  })
  .strict();

export const resendEmailOtpSchema = z
  .object({
    email,
    purpose: z.enum(['LOGIN', 'SIGNUP']).optional(),
  })
  .strict();

export type RequestEmailOtpDto = z.infer<typeof requestEmailOtpSchema>;
export type VerifyEmailOtpDto = z.infer<typeof verifyEmailOtpSchema>;
export type ResendEmailOtpDto = z.infer<typeof resendEmailOtpSchema>;
