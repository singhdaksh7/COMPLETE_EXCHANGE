import { z } from 'zod';

export const fiuGenerateSchema = z.object({
  reportType: z.enum(['STR', 'CTR', 'NTR', 'CBWTR', 'INTERNAL_SUSPICIOUS_ACTIVITY_SUMMARY']),
  scopeType: z.enum(['USER', 'CASE', 'DATE_RANGE', 'TRANSACTION_SET']),
  userId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  evidencePackId: z.string().uuid().optional(),
  narrative: z.string().max(8000).optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});

export const fiuQuerySchema = z.object({
  reportType: z.enum(['STR', 'CTR', 'NTR', 'CBWTR', 'INTERNAL_SUSPICIOUS_ACTIVITY_SUMMARY']).optional(),
  status: z.enum(['DRAFT', 'VALIDATING', 'READY_FOR_INTERNAL_REVIEW', 'EXPORTED_DRAFT', 'FAILED', 'ARCHIVED']).optional(),
  scopeUserId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const fiuStatusSchema = z.object({
  status: z.enum(['DRAFT', 'READY_FOR_INTERNAL_REVIEW', 'ARCHIVED']),
});

export const fiuExportsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type FiuGenerateDto = z.infer<typeof fiuGenerateSchema>;
export type FiuQueryDto = z.infer<typeof fiuQuerySchema>;
export type FiuStatusDto = z.infer<typeof fiuStatusSchema>;
