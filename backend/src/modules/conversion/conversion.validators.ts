import { z } from 'zod';

const conversionSide = z.enum(['INR_TO_USDT', 'USDT_TO_INR']);

/** Source-asset amount as a decimal string (≤6 dp, > 0) — never a JS float. */
const amount = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, 'Amount must be a decimal string (≤6 dp)')
  .refine((v) => !/^0(?:\.0+)?$/.test(v), 'Amount must be greater than zero');

export const createQuoteSchema = z
  .object({
    side: conversionSide,
    amount,
  })
  .strict();

export const createConversionSchema = z
  .object({
    quoteId: z.string().uuid(),
  })
  .strict();

export const historyQuerySchema = z
  .object({
    side: conversionSide.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const adminConversionQuerySchema = z
  .object({
    side: conversionSide.optional(),
    userId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateQuoteDto = z.infer<typeof createQuoteSchema>;
export type CreateConversionDto = z.infer<typeof createConversionSchema>;
export type HistoryQueryDto = z.infer<typeof historyQuerySchema>;
export type AdminConversionQueryDto = z.infer<typeof adminConversionQuerySchema>;
