import { describe, it, expect } from 'vitest';
import {
  dayBucket,
  priorityFromScore,
  evaluateRules,
  ruleHighValueWithdrawal,
  ruleRepeatedFailedWithdrawals,
  ruleRapidDepositWithdrawal,
  ruleStructuringPattern,
  ruleAbnormalTradingVolume,
  ruleHighRiskUserActivity,
  ruleScreeningRiskActivity,
  type MonitoringConfig,
  type MonitoringSnapshot,
  type TransferActivity,
} from '../../src/modules/compliance/monitoring.rules';

const NOW = new Date('2026-06-22T12:00:00.000Z');

const cfg: MonitoringConfig = {
  lookbackDays: 7,
  highValueWithdrawal: 10000,
  failedWithdrawalCount: 3,
  rapidWindowMinutes: 60,
  structuringBand: 10000,
  structuringCount: 3,
  abnormalTradingVolume: 100000,
};

function w(over: Partial<TransferActivity> = {}): TransferActivity {
  return {
    id: `w-${Math.random().toString(36).slice(2)}`,
    kind: 'CRYPTO',
    asset: 'USDT',
    amount: 100,
    outcome: 'SUCCESS',
    status: 'COMPLETED',
    at: new Date(NOW.getTime() - 60 * 1000),
    ...over,
  };
}

function snap(over: Partial<MonitoringSnapshot> = {}): MonitoringSnapshot {
  return {
    userId: 'user-1',
    withdrawals: [],
    deposits: [],
    trades: [],
    riskLevel: 'LOW',
    sanctionsStatus: 'CLEAR',
    pepStatus: 'CLEAR',
    adverseMediaStatus: 'CLEAR',
    now: NOW,
    ...over,
  };
}

describe('helpers', () => {
  it('dayBucket is the UTC date', () => {
    expect(dayBucket(NOW)).toBe('2026-06-22');
  });
  it('priorityFromScore maps the ladder', () => {
    expect(priorityFromScore(10)).toBe('LOW');
    expect(priorityFromScore(40)).toBe('MEDIUM');
    expect(priorityFromScore(60)).toBe('HIGH');
    expect(priorityFromScore(85)).toBe('CRITICAL');
  });
});

describe('R1 high-value withdrawal', () => {
  it('fires on a withdrawal at/above the threshold, keyed per withdrawal', () => {
    const out = ruleHighValueWithdrawal(snap({ withdrawals: [w({ id: 'wx', amount: 25000 })] }), cfg);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('HIGH_VALUE_WITHDRAWAL');
    expect(out[0].dedupeKey).toBe('HVW:wx');
  });
  it('ignores below-threshold and FAILED withdrawals', () => {
    const out = ruleHighValueWithdrawal(
      snap({ withdrawals: [w({ amount: 9999 }), w({ amount: 50000, outcome: 'FAILED', status: 'FAILED' })] }),
      cfg,
    );
    expect(out).toHaveLength(0);
  });
});

describe('R2 repeated failed withdrawals', () => {
  it('fires at/above the failed count and keys per user/day', () => {
    const failed = [w({ outcome: 'FAILED', status: 'FAILED' }), w({ outcome: 'FAILED', status: 'REJECTED' }), w({ outcome: 'FAILED', status: 'FAILED' })];
    const out = ruleRepeatedFailedWithdrawals(snap({ withdrawals: failed }), cfg);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe('RFW:user-1:2026-06-22');
  });
  it('does not fire below the count', () => {
    const out = ruleRepeatedFailedWithdrawals(
      snap({ withdrawals: [w({ outcome: 'FAILED', status: 'FAILED' })] }),
      cfg,
    );
    expect(out).toHaveLength(0);
  });
});

describe('R3 rapid deposit -> withdrawal', () => {
  it('fires when a withdrawal follows a deposit within the window', () => {
    const dep = w({ id: 'd1', amount: 5000, at: new Date(NOW.getTime() - 30 * 60 * 1000) });
    const wd = w({ id: 'w1', amount: 4900, at: new Date(NOW.getTime() - 10 * 60 * 1000) });
    const out = ruleRapidDepositWithdrawal(snap({ deposits: [dep], withdrawals: [wd] }), cfg);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe('RDW:d1:w1');
  });
  it('does not fire when the gap exceeds the window', () => {
    const dep = w({ id: 'd1', at: new Date(NOW.getTime() - 5 * 60 * 60 * 1000) });
    const wd = w({ id: 'w1', at: new Date(NOW.getTime() - 10 * 60 * 1000) });
    const out = ruleRapidDepositWithdrawal(snap({ deposits: [dep], withdrawals: [wd] }), cfg);
    expect(out).toHaveLength(0);
  });
});

describe('R4 structuring', () => {
  it('fires on multiple just-under-band transfers', () => {
    const xs = [w({ amount: 9000 }), w({ amount: 8500 }), w({ amount: 9900 })];
    const out = ruleStructuringPattern(snap({ withdrawals: xs }), cfg);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe('STR:user-1:2026-06-22');
  });
  it('does not fire on a single large transfer', () => {
    const out = ruleStructuringPattern(snap({ withdrawals: [w({ amount: 9000 })] }), cfg);
    expect(out).toHaveLength(0);
  });
});

describe('R5 abnormal trading volume', () => {
  it('fires when summed quote volume crosses the threshold', () => {
    const trades = [
      { quoteAmount: 60000, at: new Date(NOW.getTime() - 60 * 1000) },
      { quoteAmount: 60000, at: new Date(NOW.getTime() - 120 * 1000) },
    ];
    const out = ruleAbnormalTradingVolume(snap({ trades }), cfg);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe('ATV:user-1:2026-06-22');
  });
  it('does not fire below the threshold', () => {
    const out = ruleAbnormalTradingVolume(snap({ trades: [{ quoteAmount: 1000, at: NOW }] }), cfg);
    expect(out).toHaveLength(0);
  });
});

describe('R6 high-risk user activity', () => {
  it('fires for a HIGH-risk user WITH recent activity', () => {
    const out = ruleHighRiskUserActivity(snap({ riskLevel: 'HIGH', withdrawals: [w()] }), cfg);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe('HRU:user-1:2026-06-22');
  });
  it('does not fire for a HIGH-risk user with NO activity', () => {
    const out = ruleHighRiskUserActivity(snap({ riskLevel: 'HIGH' }), cfg);
    expect(out).toHaveLength(0);
  });
  it('PROHIBITED risk produces a CRITICAL alert', () => {
    const out = ruleHighRiskUserActivity(snap({ riskLevel: 'PROHIBITED', withdrawals: [w()] }), cfg);
    expect(out[0].priority).toBe('CRITICAL');
  });
});

describe('R7 screening risk activity', () => {
  it('fires for a HIT posture WITH activity (CRITICAL)', () => {
    const out = ruleScreeningRiskActivity(snap({ sanctionsStatus: 'HIT', withdrawals: [w()] }), cfg);
    expect(out).toHaveLength(1);
    expect(out[0].priority).toBe('CRITICAL');
    expect(out[0].dedupeKey).toBe('SRA:user-1:2026-06-22');
  });
  it('does not fire when screening is clear', () => {
    const out = ruleScreeningRiskActivity(snap({ withdrawals: [w()] }), cfg);
    expect(out).toHaveLength(0);
  });
});

describe('evaluateRules — determinism / idempotency of keys', () => {
  it('produces identical dedupeKeys across repeated evaluations', () => {
    const s = snap({
      withdrawals: [w({ id: 'wx', amount: 25000 })],
      riskLevel: 'HIGH',
    });
    const a = evaluateRules(s, cfg).map((c) => c.dedupeKey).sort();
    const b = evaluateRules(s, cfg).map((c) => c.dedupeKey).sort();
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // no dup keys within one run
  });
});
