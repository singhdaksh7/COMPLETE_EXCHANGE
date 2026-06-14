import { z } from 'zod';

const depositStatus = z.enum([
  'DETECTED',
  'CONFIRMING',
  'CONFIRMED',
  'CREDITED',
  'ORPHANED',
]);

const chainId = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_]+$/, 'Invalid chain id')
  .transform((v) => v.toUpperCase());

export const adminDepositQuerySchema = z
  .object({
    chain: chainId.optional(),
    status: depositStatus.optional(),
    userId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type AdminDepositQueryDto = z.infer<typeof adminDepositQuerySchema>;
