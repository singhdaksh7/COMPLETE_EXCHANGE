import { z } from 'zod';

const userStatus = z.enum(['ACTIVE', 'FROZEN', 'LOCKED', 'CLOSED']);
const kycStatus = z.enum([
  'NOT_STARTED',
  'PENDING',
  'IN_REVIEW',
  'MANUAL_REVIEW',
  'APPROVED',
  'REJECTED',
]);
const riskLevel = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const adminUserListQuerySchema = z
  .object({
    email: z.string().trim().max(120).optional(),
    kycStatus: kycStatus.optional(),
    accountStatus: userStatus.optional(),
    riskLevel: riskLevel.optional(),
    createdFrom: z.string().datetime().or(z.string().date()).optional(),
    createdTo: z.string().datetime().or(z.string().date()).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const userIdParamSchema = z.object({ userId: z.string().uuid() }).strict();

export const accountStatusSchema = z
  .object({ status: z.enum(['ACTIVE', 'FROZEN']) })
  .strict();

export const withdrawalBlockSchema = z
  .object({ withdrawalsBlocked: z.boolean() })
  .strict();

export const riskProfileSchema = z
  .object({
    riskLevel: riskLevel.optional(),
    riskNote: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.riskLevel !== undefined || v.riskNote !== undefined, {
    message: 'riskLevel or riskNote is required',
  });

// --- Soft delete / archive (Stage 9C) --------------------------------------

/** Archive (soft-delete) a user: a reason is mandatory for the audit trail. */
export const archiveUserSchema = z
  .object({
    reason: z.string().trim().min(3, 'A reason is required').max(500),
  })
  .strict();

/** Restore a previously archived user: a reason is mandatory for the audit trail. */
export const restoreUserSchema = z
  .object({
    reason: z.string().trim().min(3, 'A reason is required').max(500),
  })
  .strict();

export type ArchiveUserDto = z.infer<typeof archiveUserSchema>;
export type RestoreUserDto = z.infer<typeof restoreUserSchema>;

export type AdminUserListQueryDto = z.infer<typeof adminUserListQuerySchema>;
export type AccountStatusDto = z.infer<typeof accountStatusSchema>;
export type WithdrawalBlockDto = z.infer<typeof withdrawalBlockSchema>;
export type RiskProfileDto = z.infer<typeof riskProfileSchema>;
