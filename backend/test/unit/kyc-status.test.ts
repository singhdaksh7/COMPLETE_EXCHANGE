import { describe, it, expect } from 'vitest';
import {
  assertTransition,
  canTransition,
  mapProviderStatusToKyc,
  maskPan,
} from '../../src/modules/kyc/kyc.status';

describe('KYC status transition machine', () => {
  it('allows the legal lifecycle transitions', () => {
    expect(canTransition('NOT_STARTED', 'PENDING')).toBe(true);
    expect(canTransition('PENDING', 'IN_REVIEW')).toBe(true);
    expect(canTransition('PENDING', 'APPROVED')).toBe(true);
    expect(canTransition('PENDING', 'REJECTED')).toBe(true);
    expect(canTransition('IN_REVIEW', 'MANUAL_REVIEW')).toBe(true);
    expect(canTransition('MANUAL_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransition('REJECTED', 'PENDING')).toBe(true); // resubmission
  });

  it('treats a same-status change as an idempotent no-op', () => {
    expect(canTransition('APPROVED', 'APPROVED')).toBe(true);
    expect(canTransition('PENDING', 'PENDING')).toBe(true);
  });

  it('forbids illegal transitions', () => {
    expect(canTransition('APPROVED', 'REJECTED')).toBe(false);
    expect(canTransition('APPROVED', 'PENDING')).toBe(false);
    expect(canTransition('NOT_STARTED', 'APPROVED')).toBe(false);
  });

  it('assertTransition throws a 409 KYC_INVALID_TRANSITION on illegal moves', () => {
    expect(() => assertTransition('APPROVED', 'REJECTED')).toThrowError(
      /Illegal KYC status transition/,
    );
    try {
      assertTransition('APPROVED', 'PENDING');
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 409, errorCode: 'KYC_INVALID_TRANSITION' });
    }
  });

  it('assertTransition is a no-op for legal moves', () => {
    expect(() => assertTransition('PENDING', 'APPROVED')).not.toThrow();
  });
});

describe('mapProviderStatusToKyc', () => {
  it('maps each normalized provider status to a KycStatus', () => {
    expect(mapProviderStatusToKyc('PENDING')).toBe('PENDING');
    expect(mapProviderStatusToKyc('IN_REVIEW')).toBe('IN_REVIEW');
    expect(mapProviderStatusToKyc('MANUAL_REVIEW')).toBe('MANUAL_REVIEW');
    expect(mapProviderStatusToKyc('APPROVED')).toBe('APPROVED');
    expect(mapProviderStatusToKyc('REJECTED')).toBe('REJECTED');
  });
});

describe('maskPan', () => {
  it('keeps the first 5 and last 1 characters', () => {
    expect(maskPan('ABCDE1234F')).toBe('ABCDE****F');
  });
  it('returns null for a malformed PAN', () => {
    expect(maskPan('SHORT')).toBeNull();
  });
});
