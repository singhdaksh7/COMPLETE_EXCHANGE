import { z } from 'zod';

const decimal = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, 'Amount must be a positive decimal string')
  .refine((v) => !/^0(?:\.0+)?$/.test(v), 'Amount must be greater than zero');

const accountKind = z.enum([
  'USER_AVAILABLE',
  'USER_LOCKED',
  'FEE_REVENUE',
  'TDS_PAYABLE',
  'HOT_WALLET',
  'COLD_WALLET',
  'GATEWAY_CLEARING',
  'SWEEP_CLEARING',
  'LIQUIDITY',
  'SYSTEM',
]);

export const assetParamSchema = z
  .object({
    asset: z.string().trim().min(1).max(20).toUpperCase(),
  })
  .strict();

export const pageQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const inrTransactionQuerySchema = pageQuerySchema
  .extend({
    type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
  })
  .strict();

export const internalTransferSchema = z
  .object({
    amount: decimal,
    asset: z.string().trim().min(1).max(20).toUpperCase().default('INR'),
    fromKind: accountKind,
    toKind: accountKind,
    toUserId: z.string().uuid().optional(),
    referenceType: z.string().trim().min(1).max(80).optional(),
    referenceId: z.string().uuid().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((v) => v.fromKind !== v.toKind || v.toUserId, {
    message: 'Transfer must change account kind or target user',
    path: ['toKind'],
  });

export type InternalTransferDto = z.infer<typeof internalTransferSchema>;
