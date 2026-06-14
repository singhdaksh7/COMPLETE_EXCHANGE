import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../src/lib/jwt';

describe('jwt helpers', () => {
  it('round-trips an access token payload', () => {
    const token = signAccessToken({ sub: 'u1', sid: 's1', kycTier: 2 });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('u1');
    expect(decoded.sid).toBe('s1');
    expect(decoded.kycTier).toBe(2);
    expect(decoded.purpose).toBe('access');
  });

  it('round-trips a refresh token payload', () => {
    const token = signRefreshToken({ sub: 'u1', sid: 's1', fid: 'f1' });
    const decoded = verifyRefreshToken(token);
    expect(decoded.fid).toBe('f1');
    expect(decoded.purpose).toBe('refresh');
    expect(decoded.jti).toBeTruthy();
  });

  it('generates a unique refresh token for the same refresh payload', () => {
    const payload = { sub: 'u1', sid: 's1', fid: 'f1' };
    const first = signRefreshToken(payload);
    const second = signRefreshToken(payload);
    expect(second).not.toBe(first);
    expect(verifyRefreshToken(second).jti).not.toBe(verifyRefreshToken(first).jti);
  });

  it('rejects an access token verified as a refresh token (separate secrets)', () => {
    const access = signAccessToken({ sub: 'u1', sid: 's1', kycTier: 0 });
    expect(() => verifyRefreshToken(access)).toThrow();
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'u1', sid: 's1', kycTier: 0 });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });

  it('rejects a token with the wrong purpose claim', () => {
    const token = jwt.sign(
      { sub: 'u1', sid: 's1', kycTier: 0, purpose: 'refresh' },
      config.jwt.accessSecret,
      {
        algorithm: 'HS256',
        issuer: 'cex-api',
        audience: 'cex-api:access',
        expiresIn: '15m',
      },
    );
    expect(() => verifyAccessToken(token)).toThrow(/purpose/);
  });

  it('rejects a token with the wrong audience', () => {
    const token = jwt.sign(
      { sub: 'u1', sid: 's1', kycTier: 0, purpose: 'access' },
      config.jwt.accessSecret,
      {
        algorithm: 'HS256',
        issuer: 'cex-api',
        audience: 'cex-api:refresh',
        expiresIn: '15m',
      },
    );
    expect(() => verifyAccessToken(token)).toThrow();
  });
});
