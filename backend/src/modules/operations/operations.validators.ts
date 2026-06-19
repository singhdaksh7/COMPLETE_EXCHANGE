import { z } from 'zod';

const auditFilters = {
  adminId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(120).optional(),
  targetId: z.string().trim().min(1).max(120).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
};

export const auditQuerySchema = z
  .object({
    cursor: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    ...auditFilters,
  })
  .strict();

export const auditExportSchema = z.object(auditFilters).strict();

export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
export type AuditExportDto = z.infer<typeof auditExportSchema>;
