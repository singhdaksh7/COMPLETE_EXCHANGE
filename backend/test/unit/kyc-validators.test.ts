import { describe, it, expect } from 'vitest';
import {
  kycDecisionSchema,
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
});
