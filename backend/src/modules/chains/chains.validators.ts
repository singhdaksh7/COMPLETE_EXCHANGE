import { z } from 'zod';

const chainId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{2,32}$/, 'Invalid chain id')
  .transform((v) => v.toUpperCase());

export const chainParamSchema = z.object({ chain: chainId }).strict();

const depositStatus = z.enum([
  'DETECTED',
  'CONFIRMING',
  'CONFIRMED',
  'CREDITED',
  'ORPHANED',
]);

export const chainDepositsQuerySchema = z
  .object({
    status: depositStatus.optional(),
    userId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const withdrawalStatus = z.enum([
  'REQUESTED',
  'RISK_CHECK',
  'PENDING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'SIGNING',
  'BROADCAST',
  'CONFIRMING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
  'CANCELLED',
]);

export const chainWithdrawalsQuerySchema = z
  .object({
    status: withdrawalStatus.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ChainParamDto = z.infer<typeof chainParamSchema>;
export type ChainDepositsQueryDto = z.infer<typeof chainDepositsQuerySchema>;
export type ChainWithdrawalsQueryDto = z.infer<typeof chainWithdrawalsQuerySchema>;
