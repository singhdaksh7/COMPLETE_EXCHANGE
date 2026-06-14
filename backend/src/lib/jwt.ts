import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config';

const JWT_ISSUER = 'cex-api';
const ACCESS_AUDIENCE = 'cex-api:access';
const REFRESH_AUDIENCE = 'cex-api:refresh';
const ADMIN_ACCESS_AUDIENCE = 'cex-admin:access';
const ADMIN_REFRESH_AUDIENCE = 'cex-admin:refresh';

/**
 * JWT helpers.
 *
 * Access token: short-lived, carries the principal + session id; verified on
 * every authenticated request. Refresh token: long-lived, opaque to clients,
 * rotated on every use (the raw value is also stored *hashed* server-side so
 * sessions are revocable — see the auth module).
 *
 * NOTE: this foundation uses HS256 with separate access/refresh secrets.
 * ARCHITECTURE.md §11 specifies migrating to RS256 (asymmetric) before
 * production so verifiers need only the public key. The interface here does
 * not change when that swap happens.
 */
export interface AccessTokenPayload {
  sub: string; // user id
  sid: string; // session id
  kycTier: number;
  purpose: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  fid: string; // token family id (for reuse detection)
  jti: string; // unique token id; makes every rotation produce a new token
  purpose: 'refresh';
}

export interface AdminAccessTokenPayload {
  sub: string;
  sid: string;
  purpose: 'admin_access';
}

export interface AdminRefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  purpose: 'admin_refresh';
}

export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'purpose'>,
): string {
  const opts: SignOptions = {
    expiresIn: config.jwt.accessTtl as SignOptions['expiresIn'],
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: ACCESS_AUDIENCE,
  };
  return jwt.sign({ ...payload, purpose: 'access' }, config.jwt.accessSecret, opts);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: ACCESS_AUDIENCE,
  }) as AccessTokenPayload;
  if (payload.purpose !== 'access') throw new jwt.JsonWebTokenError('invalid purpose');
  return payload;
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'purpose' | 'jti'>,
): string {
  const opts: SignOptions = {
    expiresIn: config.jwt.refreshTtl as SignOptions['expiresIn'],
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: REFRESH_AUDIENCE,
  };
  return jwt.sign(
    { ...payload, jti: randomUUID(), purpose: 'refresh' },
    config.jwt.refreshSecret,
    opts,
  );
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: REFRESH_AUDIENCE,
  }) as RefreshTokenPayload;
  if (payload.purpose !== 'refresh') throw new jwt.JsonWebTokenError('invalid purpose');
  if (!payload.jti) throw new jwt.JsonWebTokenError('missing jti');
  return payload;
}

export function signAdminAccessToken(
  payload: Omit<AdminAccessTokenPayload, 'purpose'>,
): string {
  const opts: SignOptions = {
    expiresIn: config.jwt.accessTtl as SignOptions['expiresIn'],
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: ADMIN_ACCESS_AUDIENCE,
  };
  return jwt.sign(
    { ...payload, purpose: 'admin_access' },
    config.jwt.accessSecret,
    opts,
  );
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: ADMIN_ACCESS_AUDIENCE,
  }) as AdminAccessTokenPayload;
  if (payload.purpose !== 'admin_access') {
    throw new jwt.JsonWebTokenError('invalid purpose');
  }
  return payload;
}

export function signAdminRefreshToken(
  payload: Omit<AdminRefreshTokenPayload, 'purpose' | 'jti'>,
): string {
  const opts: SignOptions = {
    expiresIn: config.jwt.refreshTtl as SignOptions['expiresIn'],
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: ADMIN_REFRESH_AUDIENCE,
  };
  return jwt.sign(
    { ...payload, jti: randomUUID(), purpose: 'admin_refresh' },
    config.jwt.refreshSecret,
    opts,
  );
}

export function verifyAdminRefreshToken(token: string): AdminRefreshTokenPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: ADMIN_REFRESH_AUDIENCE,
  }) as AdminRefreshTokenPayload;
  if (payload.purpose !== 'admin_refresh') {
    throw new jwt.JsonWebTokenError('invalid purpose');
  }
  if (!payload.jti) throw new jwt.JsonWebTokenError('missing jti');
  return payload;
}
