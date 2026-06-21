import { describe, it, expect } from 'vitest';
import { scoreCustomerRisk, type RiskScoreInput } from '../../src/modules/compliance/compliance.risk';

const cfg = {
  requireLiveness: false,
  requireSanctionsBeforeApproval: false,
  defaultRiskLevel: 'MEDIUM' as const,
};

function base(over: Partial<RiskScoreInput> = {}): RiskScoreInput {
  return {
    countryOfResidence: 'IN',
    nationality: 'IN',
    hasPan: true,
    hasAadhaar: true,
    livenessStatus: 'PASSED',
    sanctionsStatus: 'CLEAR',
    pepStatus: 'CLEAR',
    adverseMediaStatus: 'CLEAR',
    rejectionCount: 0,
    adminFlag: 'NONE',
    geoCaptured: true,
    ...over,
  };
}

describe('scoreCustomerRisk', () => {
  it('a clean profile scores 0, has no reasons, and falls back to the default level', () => {
    const r = scoreCustomerRisk(base(), cfg);
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
    // No signals → configured COMPLIANCE_DEFAULT_RISK_LEVEL (MEDIUM here).
    expect(r.level).toBe('MEDIUM');
  });

  it('honours a LOW default risk level when configured', () => {
    const r = scoreCustomerRisk(base(), { ...cfg, defaultRiskLevel: 'LOW' });
    expect(r.level).toBe('LOW');
  });

  it('liveness FAILED forces PROHIBITED with a reason', () => {
    const r = scoreCustomerRisk(base({ livenessStatus: 'FAILED' }), cfg);
    expect(r.level).toBe('PROHIBITED');
    expect(r.reasons.map((x) => x.code)).toContain('LIVENESS_FAILED');
  });

  it('a sanctions HIT forces PROHIBITED', () => {
    const r = scoreCustomerRisk(base({ sanctionsStatus: 'HIT' }), cfg);
    expect(r.level).toBe('PROHIBITED');
    expect(r.reasons.map((x) => x.code)).toContain('SANCTIONS_HIT');
  });

  it('admin PROHIBITED flag forces PROHIBITED', () => {
    const r = scoreCustomerRisk(base({ adminFlag: 'PROHIBITED' }), cfg);
    expect(r.level).toBe('PROHIBITED');
  });

  it('missing country raises risk with MISSING_COUNTRY reason', () => {
    const r = scoreCustomerRisk(base({ countryOfResidence: null }), cfg);
    expect(r.reasons.map((x) => x.code)).toContain('MISSING_COUNTRY');
    expect(r.score).toBeGreaterThan(0);
  });

  it('prohibited country forces PROHIBITED', () => {
    const r = scoreCustomerRisk(base({ countryOfResidence: 'KP' }), cfg);
    expect(r.level).toBe('PROHIBITED');
    expect(r.reasons.map((x) => x.code)).toContain('PROHIBITED_COUNTRY');
  });

  it('missing PAN and Aadhaar push toward medium/high', () => {
    const r = scoreCustomerRisk(base({ hasPan: false, hasAadhaar: false }), cfg);
    expect(r.reasons.map((x) => x.code)).toEqual(
      expect.arrayContaining(['MISSING_PAN', 'MISSING_AADHAAR']),
    );
    expect(['MEDIUM', 'HIGH']).toContain(r.level);
  });

  it('repeated rejections add a REPEATED_REJECTION reason', () => {
    const r = scoreCustomerRisk(base({ rejectionCount: 3 }), cfg);
    expect(r.reasons.map((x) => x.code)).toContain('REPEATED_REJECTION');
  });

  it('admin HIGH flag elevates risk', () => {
    const r = scoreCustomerRisk(base({ adminFlag: 'HIGH' }), cfg);
    expect(r.reasons.map((x) => x.code)).toContain('ADMIN_HIGH_RISK');
    expect(['HIGH', 'PROHIBITED']).toContain(r.level);
  });

  it('requireSanctionsBeforeApproval flags un-screened users', () => {
    const r = scoreCustomerRisk(
      base({ sanctionsStatus: 'NOT_SCREENED' }),
      { ...cfg, requireSanctionsBeforeApproval: true },
    );
    expect(r.reasons.map((x) => x.code)).toContain('SANCTIONS_NOT_SCREENED');
  });

  it('every reason carries a code, message and weight', () => {
    const r = scoreCustomerRisk(base({ hasPan: false, geoCaptured: false }), cfg);
    for (const reason of r.reasons) {
      expect(reason.code).toBeTruthy();
      expect(reason.message).toBeTruthy();
      expect(typeof reason.weight).toBe('number');
    }
  });
});
