/**
 * Per-admin IPv4 allowlist matching (Stage 3.4B).
 *
 * Supports exact IPv4 addresses (e.g. "203.0.113.7") and IPv4 CIDR ranges
 * (e.g. "10.0.0.0/8"). IPv6 is intentionally out of scope for now: an IPv6
 * client IP simply never matches an IPv4 allowlist entry. An EMPTY allowlist
 * means "no restriction" — every IP is allowed.
 *
 * Behind a proxy (CloudFront/ALB) Express resolves `req.ip` from
 * X-Forwarded-For with `trust proxy` set, and IPv4-mapped IPv6 forms
 * ("::ffff:203.0.113.7") are normalized here back to dotted-quad.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV4_CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/** Strip an IPv4-mapped IPv6 prefix so "::ffff:1.2.3.4" matches "1.2.3.4". */
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '';
  const trimmed = ip.trim();
  const mapped = trimmed.toLowerCase().startsWith('::ffff:')
    ? trimmed.slice('::ffff:'.length)
    : trimmed;
  return mapped;
}

function ipv4ToInt(ip: string): number | null {
  const m = IPV4.exec(ip);
  if (!m) return null;
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return null;
  // >>> 0 keeps the result an unsigned 32-bit integer.
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

/** True when `entry` is a syntactically valid IPv4 address or IPv4 CIDR. */
export function isValidIpv4OrCidr(entry: string): boolean {
  const v = entry.trim();
  if (IPV4.test(v)) return ipv4ToInt(v) !== null;
  const c = IPV4_CIDR.exec(v);
  if (!c) return false;
  const prefix = Number(c[5]);
  if (prefix < 0 || prefix > 32) return false;
  return ipv4ToInt(`${c[1]}.${c[2]}.${c[3]}.${c[4]}`) !== null;
}

function matchesEntry(ipInt: number, entry: string): boolean {
  const v = entry.trim();
  const exact = ipv4ToInt(v);
  if (exact !== null) return exact === ipInt;

  const c = IPV4_CIDR.exec(v);
  if (!c) return false;
  const base = ipv4ToInt(`${c[1]}.${c[2]}.${c[3]}.${c[4]}`);
  if (base === null) return false;
  const prefix = Number(c[5]);
  if (prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (base & mask);
}

/**
 * Whether `clientIp` is allowed given an admin's `allowlist`.
 * An empty allowlist allows everything. A non-empty allowlist requires a match;
 * an unparseable / IPv6 client IP against an IPv4 allowlist is denied.
 */
export function isIpAllowed(
  clientIp: string | undefined | null,
  allowlist: string[] | undefined | null,
): boolean {
  if (!allowlist || allowlist.length === 0) return true;
  const ip = normalizeIp(clientIp);
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false; // non-IPv4 client cannot match an IPv4 list
  return allowlist.some((entry) => matchesEntry(ipInt, entry));
}
