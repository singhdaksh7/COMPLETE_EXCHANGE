import { z } from 'zod';

/** Zod schemas for the admin screening surface (Stage 5.1). */

export const screeningDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'FALSE_POSITIVE']),
  note: z.string().max(2000).optional(),
});

export type ScreeningDecisionDto = z.infer<typeof screeningDecisionSchema>;
