import { z } from 'zod';

/**
 * INR rupee amount as a DECIMAL STRING (never a JS float): up to 2 decimal
 * places, strictly greater than zero. The service converts to integer paise.
 */
const inrAmount = z
  .string()
  .regex(
    /^(0|[1-9]\d*)(\.\d{1,2})?$/,
    'Amount must be a decimal string with up to 2 decimal places',
  )
  .refine((v) => !/^0(?:\.0{1,2})?$/.test(v), 'Amount must be greater than zero');

const inrTxnStatus = z.enum([
  'INITIATED',
  'PENDING',
  'SUCCESS',
  'FAILED',
  'REVERSED',
]);

export const createDepositSchema = z
  .object({
    amount: inrAmount,
  })
  .strict();

export const verifyPaymentSchema = z
  .object({
    orderId: z.string().trim().min(1).max(120),
    paymentId: z.string().trim().min(1).max(120),
    signature: z.string().trim().min(1).max(256),
  })
  .strict();

export const depositIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const depositQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: inrTxnStatus.optional(),
  })
  .strict();

export const adminDepositQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: inrTxnStatus.optional(),
    provider: z.string().trim().min(1).max(40).optional(),
    userId: z.string().uuid().optional(),
  })
  .strict();

export type CreateDepositDto = z.infer<typeof createDepositSchema>;
export type VerifyPaymentDto = z.infer<typeof verifyPaymentSchema>;
export type DepositQueryDto = z.infer<typeof depositQuerySchema>;
export type AdminDepositQueryDto = z.infer<typeof adminDepositQuerySchema>;
