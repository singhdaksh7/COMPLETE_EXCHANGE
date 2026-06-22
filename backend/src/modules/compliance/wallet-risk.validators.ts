import { z } from 'zod';

/** Zod schemas for the Stage 5.3 wallet-risk + Travel Rule admin surface. */

export const walletRiskRunSchema = z.object({
  chain: z.string().min(1).max(40),
  address: z.string().min(4).max(140),
  userId: z.string().uuid().optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  withdrawalId: z.string().uuid().optional(),
  depositId: z.string().uuid().optional(),
});

export const walletRiskReviewSchema = z.object({
  decision: z.enum(['CLEAR', 'REVIEW_REQUIRED', 'BLOCKED', 'FAILED']),
  level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  note: z.string().max(2000).optional(),
});

export const walletRiskCheckQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.enum(['CLEAR', 'REVIEW_REQUIRED', 'BLOCKED', 'FAILED']).optional(),
  chain: z.string().max(40).optional(),
  address: z.string().max(140).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const walletRiskProfileQuerySchema = z.object({
  level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['CLEAR', 'REVIEW_REQUIRED', 'BLOCKED', 'FAILED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const travelRuleQuerySchema = z.object({
  status: z
    .enum(['NOT_REQUIRED', 'REQUIRED', 'PENDING_INFO', 'READY', 'SENT_MOCK', 'FAILED', 'EXEMPTED'])
    .optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  userId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const travelRuleActionSchema = z.object({
  action: z.enum(['COLLECTED', 'EXEMPTED', 'SENT_MOCK', 'REQUEST_INFO']),
  note: z.string().max(2000).optional(),
  exemptedReason: z.string().max(2000).optional(),
});

export type WalletRiskRunDto = z.infer<typeof walletRiskRunSchema>;
export type WalletRiskReviewDto = z.infer<typeof walletRiskReviewSchema>;
export type WalletRiskCheckQueryDto = z.infer<typeof walletRiskCheckQuerySchema>;
export type WalletRiskProfileQueryDto = z.infer<typeof walletRiskProfileQuerySchema>;
export type TravelRuleQueryDto = z.infer<typeof travelRuleQuerySchema>;
export type TravelRuleActionDto = z.infer<typeof travelRuleActionSchema>;
