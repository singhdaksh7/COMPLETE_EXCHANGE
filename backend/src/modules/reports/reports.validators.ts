import { z } from 'zod';

export const feeReportQuerySchema = z
  .object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  })
  .strict();

export type FeeReportQueryDto = z.infer<typeof feeReportQuerySchema>;
