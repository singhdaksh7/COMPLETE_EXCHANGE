import { z } from 'zod';
import { MasterWalletDepositStatus } from '@prisma/client';
import { SUPPORTED_CHAINS } from './crypto-deposit.config';

const EVM_TX = /^0x[0-9a-fA-F]{64}$/;
const TRON_TX = /^[0-9a-fA-F]{64}$/;

/**
 * Submit a master-wallet USDT deposit. The tx-hash format is validated per
 * chain family (EVM hashes carry a 0x prefix; TRON hashes are bare 64-hex).
 */
export const submitCryptoDepositSchema = z
  .object({
    assetSymbol: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === 'USDT', 'Only USDT is supported in V1'),
    chain: z.enum(SUPPORTED_CHAINS),
    txHash: z.string().trim().min(1).max(128),
  })
  .strict()
  .superRefine((val, ctx) => {
    const ok = val.chain === 'TRON' ? TRON_TX.test(val.txHash) : EVM_TX.test(val.txHash);
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['txHash'],
        message: 'Invalid transaction hash for the selected network',
      });
    }
  });

export const cryptoDepositListQuerySchema = z
  .object({
    status: z.nativeEnum(MasterWalletDepositStatus).optional(),
    chain: z.enum(SUPPORTED_CHAINS).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const adminCryptoDepositListQuerySchema = z
  .object({
    status: z.nativeEnum(MasterWalletDepositStatus).optional(),
    chain: z.enum(SUPPORTED_CHAINS).optional(),
    userId: z.string().uuid().optional(),
    txHash: z.string().trim().min(1).max(128).optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const depositIdParamSchema = z
  .object({ id: z.string().uuid('Invalid deposit id') })
  .strict();

export type SubmitCryptoDepositDto = z.infer<typeof submitCryptoDepositSchema>;
export type CryptoDepositListQueryDto = z.infer<typeof cryptoDepositListQuerySchema>;
export type AdminCryptoDepositListQueryDto = z.infer<
  typeof adminCryptoDepositListQuerySchema
>;
