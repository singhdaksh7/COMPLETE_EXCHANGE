import { z } from 'zod';

/**
 * Stage 9D — Admin Audit Review dashboard query validation.
 *
 * Risk level is a DERIVED classification of the admin action (see
 * audit-review.service), not a stored column, so it is constrained to the three
 * buckets the dashboard understands.
 */
export const auditRiskLevels = ['HIGH', 'MEDIUM', 'LOW'] as const;

const auditReviewFilters = {
  // Acting admin id.
  adminId: z.string().uuid().optional(),
  // Affected entity id (e.g. a user id). Matched against AdminLog.targetId.
  targetId: z.string().trim().min(1).max(120).optional(),
  // Substring match on the action code (e.g. "withdrawal", "login").
  action: z.string().trim().min(1).max(120).optional(),
  // Derived risk bucket.
  riskLevel: z.enum(auditRiskLevels).optional(),
  // Source IP (exact match).
  ip: z.string().trim().min(1).max(64).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
};

export const auditReviewQuerySchema = z
  .object({
    // BigInt cursor (AdminLog id) for keyset pagination, newest-first.
    cursor: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    ...auditReviewFilters,
  })
  .strict();

export type AuditReviewQueryDto = z.infer<typeof auditReviewQuerySchema>;
