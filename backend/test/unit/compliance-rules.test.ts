import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { runRules, scoreFindings } from '../../src/modules/compliance/compliance.rules';
import { ALERT_TYPE } from '../../src/modules/compliance/compliance.constants';
import type { ComplianceSnapshot } from '../../src/modules/compliance/compliance.types';

const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);
const NOW = new Date('2026-06-16T12:00:00.000Z');

function baseSnapshot(over: Partial<ComplianceSnapshot> = {}): ComplianceSnapshot {
  return {
    userId: 'u1',
    now: NOW,
    user: { status: 'ACTIVE', kycStatus: 'APPROVED', createdAt: new Date('2026-01-01') },
    kyc: null,
    inrDeposits: [],
    inrWithdrawals: [],
    cryptoDeposits: [],
    cryptoWithdrawals: [],
    conversions: [],
    trades: [],
    ipPeers: [],
    openManualFlags: [],
    ...over,
  };
}

const has = (findings: { alertType: string }[], type: string): boolean =>
  findings.some((f) => f.alertType === type);

describe('compliance rules — individual triggers', () => {
  it('flags a large INR deposit at/above the threshold', () => {
    const f = runRules(baseSnapshot({
      inrDeposits: [{ id: 'd1', amount: D('250000'), status: 'SUCCESS', at: NOW }],
    }));
    expect(has(f, ALERT_TYPE.LARGE_INR_DEPOSIT)).toBe(true);
    const finding = f.find((x) => x.alertType === ALERT_TYPE.LARGE_INR_DEPOSIT)!;
    expect(finding.dedupeKey).toBe('large_inr_deposit:d1');
    // Evidence is metadata only — no PII fields.
    expect(JSON.stringify(finding.evidence)).not.toMatch(/pan|aadhaar|name|email/i);
  });

  it('does not flag an INR deposit below the threshold or not SUCCESS', () => {
    expect(has(runRules(baseSnapshot({ inrDeposits: [{ id: 'd', amount: D('199999'), status: 'SUCCESS', at: NOW }] })), ALERT_TYPE.LARGE_INR_DEPOSIT)).toBe(false);
    expect(has(runRules(baseSnapshot({ inrDeposits: [{ id: 'd', amount: D('500000'), status: 'PENDING', at: NOW }] })), ALERT_TYPE.LARGE_INR_DEPOSIT)).toBe(false);
  });

  it('flags a rapid withdrawal within the window after a deposit', () => {
    const dep = new Date(NOW.getTime() - 10 * 60 * 1000); // 10m earlier
    const f = runRules(baseSnapshot({
      inrDeposits: [{ id: 'd1', amount: D('1000'), status: 'SUCCESS', at: dep }],
      cryptoWithdrawals: [{ id: 'w1', amount: D('5'), asset: 'USDT', status: 'BROADCAST', at: NOW }],
    }));
    expect(has(f, ALERT_TYPE.RAPID_WITHDRAWAL)).toBe(true);
  });

  it('does not flag a withdrawal long after the deposit', () => {
    const dep = new Date(NOW.getTime() - 5 * 60 * 60 * 1000); // 5h earlier
    const f = runRules(baseSnapshot({
      conversions: [{ id: 'c1', inrAmount: D('1000'), at: dep }],
      cryptoWithdrawals: [{ id: 'w1', amount: D('5'), asset: 'USDT', status: 'BROADCAST', at: NOW }],
    }));
    expect(has(f, ALERT_TYPE.RAPID_WITHDRAWAL)).toBe(false);
  });

  it('flags high daily INR throughput', () => {
    const f = runRules(baseSnapshot({
      conversions: [{ id: 'c1', inrAmount: D('1200000'), at: NOW }],
    }));
    expect(has(f, ALERT_TYPE.HIGH_DAILY_VOLUME)).toBe(true);
  });

  it('flags multiple failed withdrawals at/above the threshold', () => {
    const f = runRules(baseSnapshot({
      cryptoWithdrawals: [
        { id: 'w1', amount: D('1'), asset: 'USDT', status: 'FAILED', at: NOW },
        { id: 'w2', amount: D('1'), asset: 'USDT', status: 'REJECTED', at: NOW },
      ],
      inrWithdrawals: [{ id: 'i1', amount: D('1'), status: 'FAILED', at: NOW }],
    }));
    expect(has(f, ALERT_TYPE.MULTIPLE_FAILED_WITHDRAWALS)).toBe(true);
  });

  it('flags a high trade volume spike', () => {
    const f = runRules(baseSnapshot({
      trades: [{ id: 't1', quoteAmount: D('6000000'), at: NOW }],
    }));
    expect(has(f, ALERT_TYPE.HIGH_TRADE_VOLUME_SPIKE)).toBe(true);
  });

  it('flags a shared IP with other accounts', () => {
    const f = runRules(baseSnapshot({ ipPeers: [{ ip: '1.2.3.4', otherUsers: 2 }] }));
    expect(has(f, ALERT_TYPE.SHARED_IP_DEVICE)).toBe(true);
    const finding = f.find((x) => x.alertType === ALERT_TYPE.SHARED_IP_DEVICE)!;
    // Evidence carries the IP + a COUNT only, never other users' identities.
    expect(finding.evidence).toMatchObject({ ip: '1.2.3.4', otherUserCount: 2 });
  });

  it('flags KYC rejected-then-retry but not while still rejected', () => {
    expect(has(runRules(baseSnapshot({ kyc: { status: 'APPROVED', previouslyRejected: true } })), ALERT_TYPE.KYC_REJECTED_RETRY)).toBe(true);
    expect(has(runRules(baseSnapshot({ kyc: { status: 'REJECTED', previouslyRejected: true } })), ALERT_TYPE.KYC_REJECTED_RETRY)).toBe(false);
  });

  it('keeps an open manual flag contributing to the score only (no alert)', () => {
    const f = runRules(baseSnapshot({ openManualFlags: [{ severity: 'HIGH' }] }));
    const mf = f.find((x) => x.alertType === ALERT_TYPE.MANUAL_FLAG)!;
    expect(mf.scoreOnly).toBe(true);
    expect(mf.dedupeKey).toBeNull();
  });
});

describe('compliance scoring', () => {
  it('returns LOW with no findings', () => {
    const s = scoreFindings([]);
    expect(s.score).toBe(0);
    expect(s.level).toBe('LOW');
  });

  it('sums distinct alert-type weights and maps to a level (capped at 100)', () => {
    const f = runRules(baseSnapshot({
      inrDeposits: [{ id: 'd1', amount: D('250000'), status: 'SUCCESS', at: NOW }], // HIGH (50)
      ipPeers: [{ ip: '1.2.3.4', otherUsers: 1 }], // HIGH (50)
    }));
    const s = scoreFindings(f);
    expect(s.score).toBe(100);
    expect(s.level).toBe('CRITICAL');
  });

  it('counts one weight per alert type even if it fires multiple times', () => {
    const f = runRules(baseSnapshot({
      inrDeposits: [
        { id: 'd1', amount: D('250000'), status: 'SUCCESS', at: NOW },
        { id: 'd2', amount: D('300000'), status: 'SUCCESS', at: NOW },
      ],
    }));
    // Two LARGE_INR_DEPOSIT findings, but the type contributes its weight once.
    expect(f.filter((x) => x.alertType === ALERT_TYPE.LARGE_INR_DEPOSIT)).toHaveLength(2);
    expect(scoreFindings(f).score).toBe(50);
  });
});
