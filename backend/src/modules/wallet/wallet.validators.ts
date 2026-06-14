import { z } from 'zod';

/**
 * Chain id as seeded in the `chains` reference table (TRON/ETHEREUM/BSC...).
 * Normalized to upper-case; the DB column is citext so matching is
 * case-insensitive, but we keep DTOs consistent.
 */
const chainId = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_]+$/, 'Invalid chain id')
  .transform((v) => v.toUpperCase());

const walletTier = z.enum(['HOT', 'WARM', 'COLD']);

export const createDepositAddressSchema = z
  .object({
    chain: chainId,
  })
  .strict();

export const addressQuerySchema = z
  .object({
    chain: chainId.optional(),
  })
  .strict();

export const networksQuerySchema = z
  .object({
    chain: chainId.optional(),
  })
  .strict();

export const adminAddressQuerySchema = z
  .object({
    chain: chainId.optional(),
    userId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const adminHotWalletQuerySchema = z
  .object({
    chain: chainId.optional(),
    tier: walletTier.optional(),
  })
  .strict();

export const adminSignerQuerySchema = z
  .object({
    chain: chainId.optional(),
  })
  .strict();

export type CreateDepositAddressDto = z.infer<typeof createDepositAddressSchema>;
export type AddressQueryDto = z.infer<typeof addressQuerySchema>;
export type NetworksQueryDto = z.infer<typeof networksQuerySchema>;
export type AdminAddressQueryDto = z.infer<typeof adminAddressQuerySchema>;
export type AdminHotWalletQueryDto = z.infer<typeof adminHotWalletQuerySchema>;
export type AdminSignerQueryDto = z.infer<typeof adminSignerQuerySchema>;
