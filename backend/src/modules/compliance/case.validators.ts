import { z } from 'zod';

/**
 * Zod schemas for the compliance case / alert / monitoring admin surface
 * (Stage 5.2). The validate() middleware rejects malformed input before it
 * reaches the service.
 */

export const caseListQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  type: z
    .enum(['SUSPICIOUS_TRANSACTION', 'HIGH_RISK_USER', 'WALLET_RISK', 'SCREENING_MATCH', 'MANUAL_REVIEW'])
    .optional(),
  assignedToAdminId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const caseCreateSchema = z.object({
  userId: z.string().uuid(),
  type: z
    .enum(['SUSPICIOUS_TRANSACTION', 'HIGH_RISK_USER', 'WALLET_RISK', 'SCREENING_MATCH', 'MANUAL_REVIEW'])
    .default('MANUAL_REVIEW'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  title: z.string().min(2).max(200),
  summary: z.string().max(4000).optional(),
  alertIds: z.array(z.string().uuid()).max(100).optional(),
});

export const caseAssignSchema = z.object({
  // null/empty unassigns.
  adminId: z.string().uuid().nullable().optional(),
});

export const caseStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED', 'CLOSED']),
  note: z.string().max(2000).optional(),
});

export const caseNoteSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const alertLinkCaseSchema = z.object({
  caseId: z.string().uuid(),
});

export const alertStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'LINKED_TO_CASE', 'DISMISSED', 'RESOLVED']),
  note: z.string().max(2000).optional(),
});

export const monitoringRunSchema = z.object({
  // Optional: scope the run to one user; otherwise sweep recent-activity users.
  userId: z.string().uuid().optional(),
});

export type CaseListQueryDto = z.infer<typeof caseListQuerySchema>;
export type CaseCreateDto = z.infer<typeof caseCreateSchema>;
export type CaseAssignDto = z.infer<typeof caseAssignSchema>;
export type CaseStatusDto = z.infer<typeof caseStatusSchema>;
export type CaseNoteDto = z.infer<typeof caseNoteSchema>;
export type AlertLinkCaseDto = z.infer<typeof alertLinkCaseSchema>;
export type AlertStatusDto = z.infer<typeof alertStatusSchema>;
export type MonitoringRunDto = z.infer<typeof monitoringRunSchema>;
