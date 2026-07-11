import { z } from 'zod';

const email = z.string().email().toLowerCase().trim();

const otpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Verification code must be 6 digits');

export const requestEmailVerificationSchema = z
  .object({ email })
  .strict();

export const confirmEmailVerificationSchema = z
  .object({
    email,
    otp: otpCode,
  })
  .strict();

export type RequestEmailVerificationDto = z.infer<typeof requestEmailVerificationSchema>;
export type ConfirmEmailVerificationDto = z.infer<typeof confirmEmailVerificationSchema>;
