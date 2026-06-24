import { z } from 'zod';

const riskLevel = z.enum(['LOW', 'MEDIUM', 'HIGH', 'PROHIBITED']);
const caseStatus = z.enum(['OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED', 'CLOSED']);
const alertType = z.enum([
  'HIGH_VALUE_WITHDRAWAL',
  'RAPID_DEPOSIT_WITHDRAWAL',
  'STRUCTURING_PATTERN',
  'ABNORMAL_TRADING_VOLUME',
  'REPEATED_FAILED_WITHDRAWALS',
  'HIGH_RISK_USER_ACTIVITY',
  'SCREENING_RISK_ACTIVITY',
  'WALLET_RISK_ACTIVITY',
]);

export const dashboardQuerySchema = z
  .object({
    riskLevel: riskLevel.optional(),
    caseStatus: caseStatus.optional(),
    alertType: alertType.optional(),
    assignedAdminId: z.string().uuid().optional(),
    from: z.string().datetime().or(z.string().date()).optional(),
    to: z.string().datetime().or(z.string().date()).optional(),
    previewLimit: z.coerce.number().int().min(1).max(25).default(8),
  })
  .strict();

export type DashboardQueryDto = z.infer<typeof dashboardQuerySchema>;
