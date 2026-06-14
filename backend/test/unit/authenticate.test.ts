import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../src/middleware/authenticate';
import { signAccessToken } from '../../src/lib/jwt';
import { authRedisGet } from '../../src/lib/redis';
import { authService } from '../../src/modules/auth/auth.service';

vi.mock('../../src/lib/redis', () => ({
  authRedisGet: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/modules/auth/auth.service', () => ({
  authService: {
    validateAccessSession: vi.fn().mockResolvedValue({
      id: 'user-1',
      kycTier: 2,
    }),
  },
}));

const redisGet = vi.mocked(authRedisGet);
const validateAccessSession = vi.mocked(authService.validateAccessSession);
const publicUser = {
  id: 'user-1',
  email: 'user@example.com',
  phone: null,
  status: 'ACTIVE' as const,
  kycStatus: 'NOT_STARTED' as const,
  kycTier: 2,
  emailVerifiedAt: new Date(),
  totpEnabled: false,
  createdAt: new Date(),
};

function makeReq(token?: string): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as Request;
}

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockResolvedValue(null);
    validateAccessSession.mockResolvedValue(publicUser);
  });

  it('requires a durable DB-backed session after JWT verification', async () => {
    const token = signAccessToken({ sub: 'user-1', sid: 'sess-1', kycTier: 2 });
    const req = makeReq(token);
    const next = vi.fn() as NextFunction;

    await authenticate(req, {} as Response, next);

    expect(validateAccessSession).toHaveBeenCalledWith('user-1', 'sess-1');
    expect(req.user).toEqual({ id: 'user-1', sessionId: 'sess-1', kycTier: 2 });
    expect(next).toHaveBeenCalledWith();
  });

  it('falls through to the durable DB check when the Redis denylist is unavailable', async () => {
    redisGet.mockRejectedValue(new Error('redis unavailable'));
    const token = signAccessToken({ sub: 'user-1', sid: 'sess-1', kycTier: 2 });
    const req = makeReq(token);
    const next = vi.fn() as NextFunction;

    await authenticate(req, {} as Response, next);

    expect(validateAccessSession).toHaveBeenCalledWith('user-1', 'sess-1');
    expect(req.user?.id).toBe('user-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects revoked sessions from the Redis denylist fast path', async () => {
    redisGet.mockResolvedValue('1');
    const token = signAccessToken({ sub: 'user-1', sid: 'sess-1', kycTier: 2 });
    const req = makeReq(token);
    const next = vi.fn() as NextFunction;

    await authenticate(req, {} as Response, next);

    expect(validateAccessSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SESSION_REVOKED' }),
    );
  });
});
