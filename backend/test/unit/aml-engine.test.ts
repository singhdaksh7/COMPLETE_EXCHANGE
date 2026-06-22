import { describe, it, expect } from 'vitest';
import { evaluatePolicy, ruleMatches, getPath, type EngineRule } from '../../src/modules/compliance/aml.policy.engine';

function rule(over: Partial<EngineRule> = {}): EngineRule {
  return {
    id: 'r1', ruleType: 'WALLET_RISK', name: 'rule', severity: 'HIGH', action: 'REQUIRE_REVIEW',
    conditionKey: 'walletRisk.status', operator: 'eq', thresholdValue: 'BLOCKED', enabled: true,
    ...over,
  };
}

describe('getPath', () => {
  it('reads nested dotted paths', () => {
    expect(getPath({ walletRisk: { status: 'BLOCKED' } }, 'walletRisk.status')).toBe('BLOCKED');
    expect(getPath({ a: 1 }, 'a.b.c')).toBeUndefined();
  });
});

describe('ruleMatches (operators)', () => {
  const ctx = { walletRisk: { status: 'BLOCKED', level: 'CRITICAL', score: 95 }, screening: { sanctions: 'HIT' } };
  it('eq / neq', () => {
    expect(ruleMatches(rule({ operator: 'eq', conditionKey: 'walletRisk.status', thresholdValue: 'BLOCKED' }), ctx).matched).toBe(true);
    expect(ruleMatches(rule({ operator: 'neq', conditionKey: 'walletRisk.status', thresholdValue: 'CLEAR' }), ctx).matched).toBe(true);
  });
  it('gte / lt numeric', () => {
    expect(ruleMatches(rule({ operator: 'gte', conditionKey: 'walletRisk.score', thresholdValue: '90' }), ctx).matched).toBe(true);
    expect(ruleMatches(rule({ operator: 'lt', conditionKey: 'walletRisk.score', thresholdValue: '90' }), ctx).matched).toBe(false);
  });
  it('in / contains / exists', () => {
    expect(ruleMatches(rule({ operator: 'in', conditionKey: 'walletRisk.level', thresholdValue: 'HIGH,CRITICAL' }), ctx).matched).toBe(true);
    expect(ruleMatches(rule({ operator: 'contains', conditionKey: 'screening.sanctions', thresholdValue: 'hit' }), ctx).matched).toBe(true);
    expect(ruleMatches(rule({ operator: 'exists', conditionKey: 'screening.sanctions', thresholdValue: null }), ctx).matched).toBe(true);
    expect(ruleMatches(rule({ operator: 'exists', conditionKey: 'screening.pep', thresholdValue: null }), ctx).matched).toBe(false);
  });
  it('a disabled rule never matches', () => {
    expect(ruleMatches(rule({ enabled: false }), ctx).matched).toBe(false);
  });
});

describe('evaluatePolicy', () => {
  it('returns recommended actions for matched rules, sorted by severity, review-only', () => {
    const ctx = { walletRisk: { status: 'BLOCKED' }, screening: { sanctions: 'HIT' } };
    const result = evaluatePolicy(
      [
        rule({ id: 'a', severity: 'HIGH', action: 'REQUIRE_REVIEW', conditionKey: 'walletRisk.status', operator: 'eq', thresholdValue: 'BLOCKED' }),
        rule({ id: 'b', severity: 'CRITICAL', action: 'ESCALATE', conditionKey: 'screening.sanctions', operator: 'eq', thresholdValue: 'HIT' }),
        rule({ id: 'c', severity: 'LOW', action: 'FLAG_ONLY', conditionKey: 'walletRisk.status', operator: 'eq', thresholdValue: 'CLEAR' }),
      ],
      ctx,
    );
    expect(result.matchedCount).toBe(2);
    expect(result.highestSeverity).toBe('CRITICAL');
    expect(result.recommendations[0].severity).toBe('CRITICAL'); // sorted high-first
    expect(result.recommendedActions).toEqual(expect.arrayContaining(['ESCALATE', 'REQUIRE_REVIEW']));
    expect(result.reviewOnly).toBe(true);
  });

  it('no matches → empty recommendations', () => {
    const result = evaluatePolicy([rule({ conditionKey: 'x.y', operator: 'eq', thresholdValue: 'Z' })], {});
    expect(result.matchedCount).toBe(0);
    expect(result.highestSeverity).toBeNull();
  });
});
