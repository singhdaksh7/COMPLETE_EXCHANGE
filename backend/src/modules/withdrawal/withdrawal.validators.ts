import { z } from 'zod';

/** USDT amount as a decimal string (≤6 dp, > 0) — never a JS float. */
const usdtAmount = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, 'Amount must be a decimal string (≤6 dp)')
  .refine((v) => !/^0(?:\.0+)?$/.test(v), 'Amount must be greater than zero');

const chainId = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_]+$/, 'Invalid chain id')
  .transform((v) => v.toUpperCase());

// TRON base58 address shape (T + 33 base58 chars). Kept lenient but bounded.
const tronAddress = z
  .string()
  .trim()
  .regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, 'Invalid TRON address');

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

export const addAddressSchema = z
  .object({
    chain: chainId.default('TRON'),
    address: tronAddress,
    label: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const addressQuerySchema = z
  .object({ chain: chainId.optional() })
  .strict();

export const createWithdrawalSchema = z
  .object({
    toAddress: tronAddress,
    amount: usdtAmount,
  })
  .strict();

export const withdrawalIdParamSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export const withdrawalQuerySchema = z
  .object({
    status: withdrawalStatus.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const adminQueueQuerySchema = z
  .object({
    status: withdrawalStatus.optional(),
    asset: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()).optional(),
    userId: z.string().uuid().optional(),
    email: z.string().trim().min(1).max(254).optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const rejectSchema = z
  .object({ reason: z.string().trim().min(1).max(280) })
  .strict();

export type AddAddressDto = z.infer<typeof addAddressSchema>;
export type AddressQueryDto = z.infer<typeof addressQuerySchema>;
export type CreateWithdrawalDto = z.infer<typeof createWithdrawalSchema>;
export type WithdrawalQueryDto = z.infer<typeof withdrawalQuerySchema>;
export type AdminQueueQueryDto = z.infer<typeof adminQueueQuerySchema>;
export type RejectDto = z.infer<typeof rejectSchema>;
