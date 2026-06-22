import type { AmlRuleAction, AmlRuleSeverity, AmlRuleType } from '@prisma/client';

/**
 * Pure AML policy evaluation engine (Stage 5.7). Given a set of rules and an
 * internal context object, it returns RECOMMENDED actions only — it never moves
 * money, mutates records, submits a report, or blocks a flow. No IO.
 */

export interface EngineRule {
  id: string;
  ruleType: AmlRuleType;
  name: string;
  severity: AmlRuleSeverity;
  action: AmlRuleAction;
  conditionKey: string | null;
  operator: string | null;
  thresholdValue: string | null;
  enabled: boolean;
}

export interface RuleRecommendation {
  ruleId: string;
  ruleType: AmlRuleType;
  name: string;
  severity: AmlRuleSeverity;
  action: AmlRuleAction;
  matchedValue: unknown;
}

export interface EvaluationResult {
  matchedCount: number;
  highestSeverity: AmlRuleSeverity | null;
  recommendedActions: AmlRuleAction[];
  recommendations: RuleRecommendation[];
  /** Always true — the engine is advisory only. */
  reviewOnly: true;
}

const SEVERITY_ORDER: AmlRuleSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Read a dotted path (e.g. "walletRisk.level") out of a context object. */
export function getPath(ctx: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx);
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Whether a single rule's condition holds in the context. */
export function ruleMatches(rule: EngineRule, ctx: unknown): { matched: boolean; value: unknown } {
  if (!rule.enabled) return { matched: false, value: undefined };
  if (!rule.conditionKey || !rule.operator) return { matched: false, value: undefined };
  const value = getPath(ctx, rule.conditionKey);
  const threshold = rule.thresholdValue;
  const op = rule.operator.toLowerCase();

  switch (op) {
    case 'exists':
      return { matched: value !== undefined && value !== null, value };
    case 'eq':
      return { matched: String(value) === String(threshold), value };
    case 'neq':
      return { matched: String(value) !== String(threshold), value };
    case 'contains':
      return { matched: typeof value === 'string' && threshold != null && value.toLowerCase().includes(threshold.toLowerCase()), value };
    case 'in': {
      const set = (threshold ?? '').split(',').map((s) => s.trim());
      return { matched: set.includes(String(value)), value };
    }
    case 'gte':
    case 'lte':
    case 'gt':
    case 'lt': {
      const a = asNumber(value);
      const b = asNumber(threshold);
      if (a === null || b === null) return { matched: false, value };
      const matched = op === 'gte' ? a >= b : op === 'lte' ? a <= b : op === 'gt' ? a > b : a < b;
      return { matched, value };
    }
    default:
      return { matched: false, value };
  }
}

/** Evaluate a rule set against a context. Returns recommended actions only. */
export function evaluatePolicy(rules: EngineRule[], ctx: unknown): EvaluationResult {
  const recommendations: RuleRecommendation[] = [];
  for (const rule of rules) {
    const { matched, value } = ruleMatches(rule, ctx);
    if (matched) {
      recommendations.push({
        ruleId: rule.id,
        ruleType: rule.ruleType,
        name: rule.name,
        severity: rule.severity,
        action: rule.action,
        matchedValue: value,
      });
    }
  }
  recommendations.sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity));
  const highestSeverity =
    recommendations.length === 0
      ? null
      : recommendations.reduce<AmlRuleSeverity>(
          (hi, r) => (SEVERITY_ORDER.indexOf(r.severity) > SEVERITY_ORDER.indexOf(hi) ? r.severity : hi),
          'LOW',
        );
  return {
    matchedCount: recommendations.length,
    highestSeverity,
    recommendedActions: [...new Set(recommendations.map((r) => r.action))],
    recommendations,
    reviewOnly: true,
  };
}
