import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  ServiceUnavailableError,
} from '../../src/lib/errors';

describe('error hierarchy', () => {
  it('AppError carries status, code, operational flag and details', () => {
    const err = new AppError('boom', 418, 'TEAPOT', true, { a: 1 });
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(418);
    expect(err.errorCode).toBe('TEAPOT');
    expect(err.isOperational).toBe(true);
    expect(err.details).toEqual({ a: 1 });
  });

  it('subclasses map to the expected status + code', () => {
    expect(new BadRequestError()).toMatchObject({
      statusCode: 400,
      errorCode: 'BAD_REQUEST',
    });
    expect(new ValidationError()).toMatchObject({
      statusCode: 422,
      errorCode: 'VALIDATION_ERROR',
    });
    expect(new UnauthorizedError()).toMatchObject({
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
    });
    expect(new ForbiddenError()).toMatchObject({ statusCode: 403 });
    expect(new NotFoundError()).toMatchObject({ statusCode: 404 });
    expect(new ConflictError()).toMatchObject({ statusCode: 409 });
    expect(new ServiceUnavailableError()).toMatchObject({ statusCode: 503 });
  });

  it('TooManyRequestsError supports a custom code (account lockout)', () => {
    const generic = new TooManyRequestsError();
    expect(generic.errorCode).toBe('RATE_LIMITED');
    const locked = new TooManyRequestsError('locked', 'ACCOUNT_LOCKED');
    expect(locked.statusCode).toBe(429);
    expect(locked.errorCode).toBe('ACCOUNT_LOCKED');
  });
});
