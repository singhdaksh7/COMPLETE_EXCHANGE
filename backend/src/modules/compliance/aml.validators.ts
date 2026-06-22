import { z } from 'zod';

const RULE_TYPE = z.enum(['TRANSACTION_MONITORING', 'WALLET_RISK', 'USER_RISK', 'KYC', 'FIU_DRAFT', 'TAX_LEGAL', 'MANUAL']);
const SEVERITY = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const ACTION = z.enum(['FLAG_ONLY', 'CREATE_ALERT', 'CREATE_CASE', 'REQUIRE_REVIEW', 'ESCALATE']);
const OPERATOR = z.enum(['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'contains', 'exists']);

export const amlPolicyCreateSchema = z.object({
  version: z.string().min(1).max(40),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
});

export const amlRuleCreateSchema = z.object({
  ruleType: RULE_TYPE,
  name: z.string().min(2).max(160),
  severity: SEVERITY.optional(),
  action: ACTION.optional(),
  conditionKey: z.string().max(120).optional(),
  operator: OPERATOR.optional(),
  thresholdValue: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

export const amlRulePatchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  severity: SEVERITY.optional(),
  action: ACTION.optional(),
  conditionKey: z.string().max(120).optional(),
  operator: OPERATOR.optional(),
  thresholdValue: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
  description: z.string().max(1000).optional(),
});

export const amlEvaluateSchema = z.object({
  policyId: z.string().uuid().optional(),
  context: z.record(z.unknown()),
});

export type AmlPolicyCreateDto = z.infer<typeof amlPolicyCreateSchema>;
export type AmlRuleCreateDto = z.infer<typeof amlRuleCreateSchema>;
export type AmlRulePatchDto = z.infer<typeof amlRulePatchSchema>;
export type AmlEvaluateDto = z.infer<typeof amlEvaluateSchema>;
