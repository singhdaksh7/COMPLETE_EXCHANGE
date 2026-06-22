import { z } from 'zod';

/** Zod schemas for the Stage 5.4 evidence-pack + retention admin surface. */

export const evidencePackCreateSchema = z.object({
  packType: z.enum(['USER_KYC', 'STR_CASE', 'WALLET_RISK', 'TRAVEL_RULE', 'FULL_USER_COMPLIANCE']),
  userId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  ref: z.string().max(200).optional(),
  format: z.enum(['JSON', 'PDF_PLACEHOLDER']).optional(),
});

export const evidencePackQuerySchema = z.object({
  packType: z.enum(['USER_KYC', 'STR_CASE', 'WALLET_RISK', 'TRAVEL_RULE', 'FULL_USER_COMPLIANCE']).optional(),
  status: z.enum(['QUEUED', 'BUILDING', 'READY', 'FAILED', 'EXPIRED']).optional(),
  scopeUserId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const retentionPolicySchema = z.object({
  recordType: z
    .enum(['KYC', 'COMPLIANCE_EVIDENCE', 'STR_CASE', 'WALLET_RISK', 'TRAVEL_RULE', 'AUDIT_LOG', 'TAX_LEGAL'])
    .or(z.string().min(2).max(40)),
  retentionYears: z.coerce.number().int().min(1).max(25),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  description: z.string().max(500).optional(),
});

export const retentionReviewStatusSchema = z.object({
  status: z.enum(['REVIEWED', 'ESCALATED']),
  notes: z.string().max(2000).optional(),
});

export const retentionReviewQuerySchema = z.object({
  recordType: z.string().max(40).optional(),
  status: z.enum(['PENDING', 'REVIEWED', 'ESCALATED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const exportEventsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type EvidencePackCreateDto = z.infer<typeof evidencePackCreateSchema>;
export type EvidencePackQueryDto = z.infer<typeof evidencePackQuerySchema>;
export type RetentionPolicyDto = z.infer<typeof retentionPolicySchema>;
export type RetentionReviewStatusDto = z.infer<typeof retentionReviewStatusSchema>;
export type RetentionReviewQueryDto = z.infer<typeof retentionReviewQuerySchema>;
export type ExportEventsQueryDto = z.infer<typeof exportEventsQuerySchema>;
