import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { adminAuthenticate } from '../../src/middleware/admin-authenticate';
import { signAccessToken, signAdminAccessToken } from '../../src/lib/jwt';
import { adminRbacService } from '../../src/modules/admin-rbac/admin-rbac.service';

vi.mock('../../src/modules/admin-rbac/admin-rbac.service', () => ({
  adminRbacService: {
    validateAdminSession: vi.fn().mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      status: 'ACTIVE',
    }),
  },
}));

const validateAdminSession = vi.mocked(adminRbacService.validateAdminSession);

function reqWith(token: string): Request {
  return {
    headers: { authorization: `Bearer ${token}` },
  } as Request;
}

describe('adminAuthenticate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateAdminSession.mockResolvedValue({ id: 'admin-1' } as never);
  });

  it('accepts admin tokens and checks the live admin session', async () => {
    const token = signAdminAccessToken({ sub: 'admin-1', sid: 'sess-1' });
    const req = reqWith(token);
    const next = vi.fn() as NextFunction;

    await adminAuthenticate(req, {} as Response, next);

    expect(validateAdminSession).toHaveBeenCalledWith('admin-1', 'sess-1');
    expect(req.admin).toEqual({ id: 'admin-1', sessionId: 'sess-1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects public user access tokens', async () => {
    const token = signAccessToken({ sub: 'user-1', sid: 'sess-1', kycTier: 0 });
    const req = reqWith(token);
    const next = vi.fn() as NextFunction;

    await adminAuthenticate(req, {} as Response, next);

    expect(validateAdminSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
