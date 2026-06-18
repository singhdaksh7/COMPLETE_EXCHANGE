import { describe, it, expect } from 'vitest';
import {
  isIpAllowed,
  isValidIpv4OrCidr,
  normalizeIp,
} from '../../src/lib/ip-allowlist';

describe('normalizeIp', () => {
  it('strips an IPv4-mapped IPv6 prefix', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp(undefined)).toBe('');
  });
});

describe('isValidIpv4OrCidr', () => {
  it('accepts valid IPv4 and CIDR', () => {
    expect(isValidIpv4OrCidr('10.0.0.1')).toBe(true);
    expect(isValidIpv4OrCidr('10.0.0.0/8')).toBe(true);
    expect(isValidIpv4OrCidr('203.0.113.255/32')).toBe(true);
  });
  it('rejects malformed entries', () => {
    expect(isValidIpv4OrCidr('10.0.0.256')).toBe(false);
    expect(isValidIpv4OrCidr('10.0.0.1/33')).toBe(false);
    expect(isValidIpv4OrCidr('not-an-ip')).toBe(false);
    expect(isValidIpv4OrCidr('::1')).toBe(false); // IPv6 unsupported
  });
});

describe('isIpAllowed', () => {
  it('allows everything when the allowlist is empty', () => {
    expect(isIpAllowed('1.2.3.4', [])).toBe(true);
    expect(isIpAllowed('1.2.3.4', undefined)).toBe(true);
  });

  it('matches an exact IPv4 entry', () => {
    expect(isIpAllowed('203.0.113.7', ['203.0.113.7'])).toBe(true);
    expect(isIpAllowed('203.0.113.8', ['203.0.113.7'])).toBe(false);
  });

  it('matches IPv4-mapped IPv6 client form', () => {
    expect(isIpAllowed('::ffff:203.0.113.7', ['203.0.113.7'])).toBe(true);
  });

  it('matches a CIDR range', () => {
    expect(isIpAllowed('10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(isIpAllowed('11.1.2.3', ['10.0.0.0/8'])).toBe(false);
    expect(isIpAllowed('192.168.1.50', ['192.168.1.0/24'])).toBe(true);
    expect(isIpAllowed('192.168.2.50', ['192.168.1.0/24'])).toBe(false);
  });

  it('denies a non-IPv4 client against an IPv4 allowlist', () => {
    expect(isIpAllowed('::1', ['10.0.0.0/8'])).toBe(false);
    expect(isIpAllowed(undefined, ['10.0.0.0/8'])).toBe(false);
  });

  it('supports multiple entries', () => {
    const list = ['203.0.113.7', '10.0.0.0/8'];
    expect(isIpAllowed('203.0.113.7', list)).toBe(true);
    expect(isIpAllowed('10.9.9.9', list)).toBe(true);
    expect(isIpAllowed('8.8.8.8', list)).toBe(false);
  });
});
