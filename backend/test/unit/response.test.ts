import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import { sendSuccess, sendError } from '../../src/utils/response';

/** Minimal Express Response stub that records status + json payload. */
function fakeRes(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

describe('response envelope', () => {
  it('wraps success payloads with success:true and data', () => {
    const res = fakeRes();
    sendSuccess(res, { hello: 'world' });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ success: true, data: { hello: 'world' } });
  });

  it('honours a custom status code and includes meta when given', () => {
    const res = fakeRes();
    sendSuccess(res, { id: 1 }, 201, { page: 1 });
    expect(res._status).toBe(201);
    expect(res._body).toEqual({
      success: true,
      data: { id: 1 },
      meta: { page: 1 },
    });
  });

  it('shapes errors with code and message', () => {
    const res = fakeRes();
    sendError(res, 409, 'CONFLICT', 'Already exists');
    expect(res._status).toBe(409);
    expect(res._body).toEqual({
      success: false,
      error: { code: 'CONFLICT', message: 'Already exists' },
    });
  });

  it('omits details when undefined and includes them when present', () => {
    const withDetails = fakeRes();
    sendError(withDetails, 422, 'VALIDATION_ERROR', 'bad', [{ path: 'email' }]);
    expect(withDetails._body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad',
        details: [{ path: 'email' }],
      },
    });
  });
});
