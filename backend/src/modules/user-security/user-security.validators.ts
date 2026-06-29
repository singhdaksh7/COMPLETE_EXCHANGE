import { z } from 'zod';

/** A 6-digit TOTP code. */
const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');

/** A TOTP code OR a backup recovery code (looser shape; verified server-side). */
const totpOrBackupCode = z.string().trim().min(6).max(32);

export const confirm2faSchema = z.object({ code: totpCode }).strict();

export const disable2faSchema = z
  .object({
    password: z.string().min(1, 'Password is required'),
    code: totpOrBackupCode,
  })
  .strict();

export const regenerateBackupCodesSchema = z
  .object({ code: totpOrBackupCode })
  .strict();

/**
 * Step-up verification. Either a password (users without 2FA) or a TOTP/backup
 * code (users with 2FA). Both optional at the schema layer; the service requires
 * the correct one based on the user's 2FA state.
 */
export const stepUpSchema = z
  .object({
    password: z.string().min(1).optional(),
    code: totpOrBackupCode.optional(),
  })
  .strict();

export type Confirm2faDto = z.infer<typeof confirm2faSchema>;
export type Disable2faDto = z.infer<typeof disable2faSchema>;
export type StepUpDto = z.infer<typeof stepUpSchema>;
