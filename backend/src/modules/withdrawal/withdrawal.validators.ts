import { z } from 'zod';

/** USDT amount as a decimal string (≤6 dp, > 0) — never a JS float. */
const usdtAmount = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, 'Amount must be a decimal string (≤6 dp)')
  .refine((v) => !/^0(?:\.0+)?$/.test(v), 'Amount must be greater than zero');

// The withdrawal flow supports TRON + EVM (Ethereum/BSC).
const chainEnum = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.enum(['TRON', 'ETHEREUM', 'BSC']));

// A destination address — its FORMAT is validated against the chain in a
// superRefine below (EVM → 0x+40 hex; TRON → base58 T-address).
const anyAddress = z.string().trim().min(20).max(64);

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

function addressMatchesChain(chain: string, address: string): boolean {
  if (chain === 'ETHEREUM' || chain === 'BSC') return EVM_ADDRESS_RE.test(address);
  if (chain === 'TRON') return TRON_ADDRESS_RE.test(address);
  return false;
}

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
    chain: chainEnum.default('TRON'),
    address: anyAddress,
    label: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!addressMatchesChain(v.chain, v.address)) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: `Invalid ${v.chain} address` });
    }
  });

export const addressQuerySchema = z
  .object({ chain: chainEnum.optional() })
  .strict();

export const createWithdrawalSchema = z
  .object({
    chain: chainEnum.default('TRON'),
    toAddress: anyAddress,
    amount: usdtAmount,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!addressMatchesChain(v.chain, v.toAddress)) {
      ctx.addIssue({ code: 'custom', path: ['toAddress'], message: `Invalid ${v.chain} address` });
    }
  });

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
    chain: chainEnum.optional(),
    asset: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{2,16}$/)
      .transform((v) => v.toUpperCase())
      .optional(),
    userId: z.string().uuid().optional(),
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
