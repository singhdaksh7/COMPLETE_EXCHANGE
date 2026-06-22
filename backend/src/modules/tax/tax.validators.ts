import { z } from 'zod';

const EVENT = z.enum(['TRADE_SELL', 'WITHDRAWAL', 'CONVERSION', 'FEE', 'OTHER']);

export const taxRuleUpsertSchema = z.object({
  eventType: EVENT,
  name: z.string().min(2).max(120),
  rateBps: z.coerce.number().int().min(0).max(10000),
  thresholdAmount: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  description: z.string().max(500).optional(),
});

/** User updates only their PAN availability / residency posture. */
export const taxProfileUserSchema = z.object({
  panAvailable: z.boolean().optional(),
  residentStatus: z.enum(['RESIDENT', 'NON_RESIDENT']).optional(),
});

export const taxProfileAdminSchema = taxProfileUserSchema.extend({
  panStatus: z.string().max(40).optional(),
  higherTdsApplicable: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

export const taxEventSchema = z.object({
  eventType: EVENT,
  grossAmount: z.coerce.number().min(0),
  asset: z.string().max(20).optional(),
  sourceType: z.string().max(40).optional(),
  sourceRef: z.string().max(120).optional(),
});

export const taxStatementGenerateSchema = z.object({
  userId: z.string().uuid(),
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-YY').optional(),
  events: z.array(taxEventSchema).max(200).optional(),
});

export const taxQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  eventType: EVENT.optional(),
  financialYear: z.string().max(10).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const taxSummaryQuerySchema = z.object({
  financialYear: z.string().max(10).optional(),
});

export type TaxRuleUpsertDto = z.infer<typeof taxRuleUpsertSchema>;
export type TaxProfileUserDto = z.infer<typeof taxProfileUserSchema>;
export type TaxProfileAdminDto = z.infer<typeof taxProfileAdminSchema>;
export type TaxStatementGenerateDto = z.infer<typeof taxStatementGenerateSchema>;
export type TaxQueryDto = z.infer<typeof taxQuerySchema>;
