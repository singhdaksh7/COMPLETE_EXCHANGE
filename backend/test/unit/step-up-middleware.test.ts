import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock the user-security service the middleware consults.
vi.mock('../../src/modules/user-security/user-security.service', () => ({
  securityService: {
    hasValidStepUp: vi.fn(),
  },
}));

import { requireStepUp } from '../../src/middleware/require-step-up';
import { securityService } from '../../src/modules/user-security/user-security.service';

const svc = vi.mocked(securityService);

function fakeReq(over: Partial<Request> & { headers?: Record<string, string> } = {}): Request {
  const headers = over.headers ?? {};
  return {
    user: { id: 'user-1', sessionId: 'sess-1', kycTier: 1 },
    header: (name: string) => headers[name],
    ...over,
  } as unknown as Request;
}

describe('requireStepUp middleware (sensitive-action gate)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks a sensitive request with STEP_UP_REQUIRED when no valid step-up token is present', async () => {
    svc.hasValidStepUp.mockResolvedValue(false);
    const next = vi.fn();
    await requireStepUp()(fakeReq(), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toMatchObject({ errorCode: 'STEP_UP_REQUIRED', statusCode: 401 });
  });

  it('allows the request when a valid step-up token is presented', async () => {
    svc.hasValidStepUp.mockResolvedValue(true);
    const next = vi.fn();
    await requireStepUp()(
      fakeReq({ headers: { 'X-Step-Up-Token': 'good-token' } }),
      {} as Response,
      next,
    );

    expect(svc.hasValidStepUp).toHaveBeenCalledWith('user-1', 'good-token');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined(); // no error → proceed
  });

  it('rejects when there is no authenticated user', async () => {
    const next = vi.fn();
    await requireStepUp()({ header: () => undefined } as unknown as Request, {} as Response, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});
