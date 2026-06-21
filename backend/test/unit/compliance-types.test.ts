import { describe, it, expect } from 'vitest';
import {
  extractGeoEvidence,
  last4,
  maskAadhaar,
  maskPan,
} from '../../src/modules/compliance/compliance.types';

describe('compliance masking helpers', () => {
  it('maskPan keeps first 5 + last 1 only', () => {
    expect(maskPan('ABCDE1234F')).toBe('ABCDE****F');
    expect(maskPan('abcde1234f')).toBe('ABCDE****F');
    expect(maskPan('bad')).toBeNull();
    expect(maskPan(null)).toBeNull();
  });

  it('maskAadhaar reveals only the last 4 digits', () => {
    expect(maskAadhaar('123412341234')).toBe('XXXX XXXX 1234');
    expect(maskAadhaar('1234 1234 1234')).toBe('XXXX XXXX 1234');
    // never reveals more than the last 4
    expect(maskAadhaar('123412341234')).not.toContain('1234123');
  });

  it('last4 returns only the final 4 chars', () => {
    expect(last4('ABCDE1234F')).toBe('234F');
    expect(last4('1')).toBeNull();
    expect(last4(null)).toBeNull();
  });
});

describe('extractGeoEvidence (CloudFront viewer headers)', () => {
  it('captures coarse geo + UA from CloudFront headers', () => {
    const geo = extractGeoEvidence({
      ip: '203.0.113.9',
      headers: {
        'cloudfront-viewer-country': 'IN',
        'cloudfront-viewer-country-region': 'MH',
        'cloudfront-viewer-city': 'Mumbai',
        'cloudfront-viewer-latitude': '19.07',
        'cloudfront-viewer-longitude': '72.87',
        'user-agent': 'Mozilla/5.0',
      },
    });
    expect(geo.ip).toBe('203.0.113.9');
    expect(geo.country).toBe('IN');
    expect(geo.region).toBe('MH');
    expect(geo.city).toBe('Mumbai');
    expect(geo.userAgent).toBe('Mozilla/5.0');
    expect(geo.status).toBe('CAPTURED');
  });

  it('marks NOT_CAPTURED when no geo headers are present', () => {
    const geo = extractGeoEvidence({ ip: '203.0.113.9', headers: { 'user-agent': 'curl/8' } });
    expect(geo.country).toBeNull();
    expect(geo.status).toBe('NOT_CAPTURED');
  });

  it('marks PARTIAL when only some geo signals are present', () => {
    const geo = extractGeoEvidence({
      ip: null,
      headers: { 'cloudfront-viewer-city': 'Pune' },
    });
    expect(geo.status).toBe('PARTIAL');
  });
});
