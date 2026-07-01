import { describe, it, expect } from 'vitest';
import {
  kycDecisionSchema,
  kycDocumentSchema,
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

  it('rejects HTML/script in identity + address fields (stored-XSS guard)', () => {
    // fullName with a script tag.
    expect(() =>
      kycSubmitSchema.parse({
        fullName: '<script>alert(1)</script>',
        dob: '1990-05-15',
        pan: 'ABCDE1234F',
      }),
    ).toThrow();
    // Angle brackets anywhere in an address free-text field.
    for (const field of ['line1', 'line2', 'city', 'state']) {
      expect(() =>
        kycSubmitSchema.parse({
          fullName: 'Jane Doe',
          dob: '1990-05-15',
          pan: 'ABCDE1234F',
          address: { [field]: '<img src=x onerror=alert(1)>' },
        }),
      ).toThrow();
    }
    // A normal name/address with an apostrophe or hyphen still parses.
    expect(
      kycSubmitSchema.parse({
        fullName: "O'Brien-Smith",
        dob: '1990-05-15',
        pan: 'ABCDE1234F',
        address: { line1: '12/A, MG Road', city: 'Pune', state: 'MH' },
      }).fullName,
    ).toBe("O'Brien-Smith");
  });

  it('rejects HTML in a decision reason and standalone note', () => {
    expect(() =>
      kycDecisionSchema.parse({
        decision: 'REJECT',
        reason: '<b>blurry</b>',
      }),
    ).toThrow();
    expect(() => kycNoteSchema.parse({ note: '<script>x</script>' })).toThrow();
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

  it('accepts a document upload with an allowed MIME type', () => {
    for (const contentType of ['image/jpeg', 'image/png', 'application/pdf']) {
      const parsed = kycDocumentSchema.parse({
        docType: 'PAN',
        sha256: 'a'.repeat(64),
        contentType,
      });
      expect(parsed.contentType).toBe(contentType);
    }
  });

  it('rejects unsafe / unsupported document MIME types', () => {
    for (const contentType of [
      'image/svg+xml', // script-bearing
      'text/html', // XSS vector
      'application/x-msdownload', // executable
      'application/zip', // archive
      'application/octet-stream', // unknown/binary
      'application/javascript', // script
    ]) {
      expect(() =>
        kycDocumentSchema.parse({
          docType: 'PAN',
          sha256: 'a'.repeat(64),
          contentType,
        }),
      ).toThrow();
    }
  });

  it('accepts an optional positive fileSize and rejects non-positive values', () => {
    expect(
      kycDocumentSchema.parse({
        docType: 'PAN',
        sha256: 'a'.repeat(64),
        contentType: 'application/pdf',
        fileSize: 2048,
      }),
    ).toMatchObject({ fileSize: 2048 });

    // Absent fileSize is allowed (backwards compatible).
    expect(
      kycDocumentSchema.parse({
        docType: 'PAN',
        sha256: 'a'.repeat(64),
        contentType: 'application/pdf',
      }).fileSize,
    ).toBeUndefined();

    // Zero / negative are rejected.
    for (const fileSize of [0, -10]) {
      expect(() =>
        kycDocumentSchema.parse({
          docType: 'PAN',
          sha256: 'a'.repeat(64),
          contentType: 'application/pdf',
          fileSize,
        }),
      ).toThrow();
    }
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
