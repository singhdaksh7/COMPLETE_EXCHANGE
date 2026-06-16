import { z } from 'zod';

/**
 * Treasury request validators. Amounts are decimal STRINGS (never JS floats),
 * validated as positive with ≤18 dp to match the NUMERIC(38,18) ledger columns.
 */
const positiveDecimal = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/, 'Must be a decimal string (≤18 dp)')
  .refine((v) => !/^0(?:\.0+)?$/.test(v), 'Must be greater than zero');

const assetSymbol = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{2,16}$/, 'Invalid asset symbol')
  .transform((v) => v.toUpperCase());

const chainId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{2,32}$/, 'Invalid chain id')
  .transform((v) => v.toUpperCase());

const transferStatus = z.enum([
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'BROADCAST',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

const transferType = z.enum(['SWEEP', 'REFILL']);

export const treasuryWalletQuerySchema = z
  .object({ chain: chainId.optional() })
  .strict();

export const transferListQuerySchema = z
  .object({
    type: transferType.optional(),
    status: transferStatus.optional(),
    chain: chainId.optional(),
    asset: assetSymbol.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

/** Body shared by sweep (hot→cold) and refill (cold→hot) requests. */
export const transferRequestSchema = z
  .object({
    fromWalletId: z.string().uuid(),
    toWalletId: z.string().uuid(),
    asset: assetSymbol,
    amount: positiveDecimal,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((v) => v.fromWalletId !== v.toWalletId, {
    message: 'Source and destination wallets must differ',
    path: ['toWalletId'],
  });

export const transferIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const rejectBodySchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type TreasuryWalletQueryDto = z.infer<typeof treasuryWalletQuerySchema>;
export type TransferListQueryDto = z.infer<typeof transferListQuerySchema>;
export type TransferRequestDto = z.infer<typeof transferRequestSchema>;
export type TransferIdParamDto = z.infer<typeof transferIdParamSchema>;
export type RejectBodyDto = z.infer<typeof rejectBodySchema>;
