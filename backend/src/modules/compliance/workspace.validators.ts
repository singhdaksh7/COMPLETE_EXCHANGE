import { z } from 'zod';

const TASK_TYPE = z.enum(['KYC_REVIEW', 'SCREENING_REVIEW', 'STR_CASE_REVIEW', 'WALLET_RISK_REVIEW', 'TRAVEL_RULE_REVIEW', 'FIU_DRAFT_REVIEW', 'TAX_LEGAL_REVIEW', 'GENERAL_AML_REVIEW']);
const TASK_STATUS = z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_INFO', 'ESCALATED', 'COMPLETED', 'CANCELLED']);
const PRIORITY = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const APPROVAL_TYPE = z.enum(['FIU_DRAFT_EXPORT', 'CASE_STATUS_CHANGE', 'RISK_OVERRIDE', 'SCREENING_OVERRIDE', 'WALLET_RISK_OVERRIDE', 'LEGAL_POLICY_PUBLISH']);

export const taskCreateSchema = z.object({
  type: TASK_TYPE,
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  priority: PRIORITY.optional(),
  assignedToAdminId: z.string().uuid().optional(),
  slaMinutes: z.coerce.number().int().min(1).max(525600).optional(),
  scopeUserId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  alertId: z.string().uuid().optional(),
  walletRiskCheckId: z.string().uuid().optional(),
  fiuReportId: z.string().uuid().optional(),
  evidencePackId: z.string().uuid().optional(),
});

export const taskQuerySchema = z.object({
  status: TASK_STATUS.optional(),
  type: TASK_TYPE.optional(),
  assignedToAdminId: z.string().uuid().optional(),
  scopeUserId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const taskAssignSchema = z.object({ adminId: z.string().uuid().nullable().optional() });
export const taskStatusSchema = z.object({ status: TASK_STATUS, note: z.string().max(2000).optional() });
export const taskCommentSchema = z.object({ body: z.string().min(1).max(4000) });

export const checklistTemplateSchema = z.object({
  taskType: TASK_TYPE,
  name: z.string().min(2).max(160),
  version: z.string().max(40).optional(),
  items: z.array(z.object({ key: z.string().min(1).max(80), label: z.string().min(1).max(300), required: z.boolean().optional() })).min(1).max(100),
  requiredForCompletion: z.boolean().optional(),
});

export const checklistResponseSchema = z.object({
  templateId: z.string().uuid().optional(),
  answers: z.array(z.object({ key: z.string().min(1).max(80), value: z.unknown(), note: z.string().max(1000).optional() })).max(200),
  complete: z.boolean().optional(),
});

export const approvalCreateSchema = z.object({
  approvalType: APPROVAL_TYPE,
  title: z.string().min(2).max(200),
  reason: z.string().max(2000).optional(),
  targetType: z.string().max(60).optional(),
  targetId: z.string().max(120).optional(),
  taskId: z.string().uuid().optional(),
});

export const approvalDecideSchema = z.object({ note: z.string().max(2000).optional() });

export const approvalQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  approvalType: APPROVAL_TYPE.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type TaskCreateDto = z.infer<typeof taskCreateSchema>;
export type TaskQueryDto = z.infer<typeof taskQuerySchema>;
export type TaskAssignDto = z.infer<typeof taskAssignSchema>;
export type TaskStatusDto = z.infer<typeof taskStatusSchema>;
export type TaskCommentDto = z.infer<typeof taskCommentSchema>;
export type ChecklistTemplateDto = z.infer<typeof checklistTemplateSchema>;
export type ChecklistResponseDto = z.infer<typeof checklistResponseSchema>;
export type ApprovalCreateDto = z.infer<typeof approvalCreateSchema>;
export type ApprovalQueryDto = z.infer<typeof approvalQuerySchema>;
