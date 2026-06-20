import { describe, it, expect } from 'vitest';
import {
  kycDecisionSchema,
  kycNoteSchema,
  kycQueueQuerySchema,
  kycSubmitSchema,
} from '../../src/modules/kyc/kyc.validators';

describe('kyc validators', () => {
  it('normalises and accepts a valid profile submission', () => {
    const parsed = kycSubmitSchema.parse({
      fullName: '  Jane Doe ',
      dob: '1990-05-15',
      pan: 'abcde1234f',
    });
    expect(parsed.fullName).toBe('Jane Doe');
    expect(parsed.pan).toBe('ABCDE1234F');
  });

  it('rejects a malformed PAN', () => {
    expect(() =>
      kycSubmitSchema.parse({ fullName: 'Jane', dob: '1990-05-15', pan: '123' }),
    ).toThrow();
  });

  it('requires a reason when rejecting', () => {
    expect(() => kycDecisionSchema.parse({ decision: 'REJECT' })).toThrow();
    expect(
      kycDecisionSchema.parse({ decision: 'REJECT', reason: 'blurry' }),
    ).toMatchObject({ decision: 'REJECT', reason: 'blurry' });
  });

  it('allows approval with an optional tier and no reason', () => {
    expect(kycDecisionSchema.parse({ decision: 'APPROVE', tier: 2 })).toMatchObject(
      { decision: 'APPROVE', tier: 2 },
    );
  });

  it('requires a reason when requesting more info', () => {
    expect(() => kycDecisionSchema.parse({ decision: 'REQUEST_INFO' })).toThrow();
    expect(
      kycDecisionSchema.parse({ decision: 'REQUEST_INFO', reason: 'send a clearer PAN' }),
    ).toMatchObject({ decision: 'REQUEST_INFO', reason: 'send a clearer PAN' });
  });

  it('accepts an optional internal compliance note on a decision', () => {
    const parsed = kycDecisionSchema.parse({
      decision: 'REJECT',
      reason: 'blurry',
      complianceNote: 'second mismatch this month',
    });
    expect(parsed.complianceNote).toBe('second mismatch this month');
  });

  it('requires a non-empty note for the standalone note endpoint', () => {
    expect(() => kycNoteSchema.parse({ note: '' })).toThrow();
    expect(kycNoteSchema.parse({ note: 'watchlist hit' })).toMatchObject({ note: 'watchlist hit' });
  });

  it('coerces queue filters (status / risk / dates)', () => {
    const parsed = kycQueueQuerySchema.parse({
      status: 'NEEDS_MORE_INFO',
      riskLevel: 'HIGH',
      submittedFrom: '2026-06-01',
    });
    expect(parsed.status).toBe('NEEDS_MORE_INFO');
    expect(parsed.riskLevel).toBe('HIGH');
    expect(parsed.submittedFrom).toBeInstanceOf(Date);
    expect(parsed.limit).toBe(20);
  });
});
