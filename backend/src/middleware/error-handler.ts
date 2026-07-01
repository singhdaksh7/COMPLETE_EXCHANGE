import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { AppError } from '../lib/errors';
import { sendError } from '../utils/response';
import { config } from '../config';

/**
 * True for the SyntaxError express.json()/body-parser raises on an unparseable
 * request body. body-parser tags it `type: 'entity.parse.failed'` and attaches
 * the offending `body`; we match on either signal so a parser upgrade that drops
 * one of them still classifies correctly.
 */
function isBodyParseError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { type?: unknown; body?: unknown };
  if (e.type === 'entity.parse.failed') return true;
  return err instanceof SyntaxError && 'body' in e;
}

/**
 * Central error handler — the single place that turns any thrown error into
 * the standard error envelope. Mounted last, after all routes.
 *
 * Responsibilities:
 *  - Map known error types (AppError, Zod, Prisma, JWT) to status + code.
 *  - Log at the right level (operational = warn, unexpected = error).
 *  - Never leak stack traces or internal messages to clients in production.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const log = req.log ?? console;

  // 1. Our own application errors — already shaped correctly.
  if (err instanceof AppError) {
    if (err.isOperational) {
      log.warn({ err, code: err.errorCode }, err.message);
    } else {
      log.error({ err, code: err.errorCode }, err.message);
    }
    sendError(res, err.statusCode, err.errorCode, err.message, err.details);
    return;
  }

  // 1b. Malformed request body from express.json()/body-parser. It throws a
  // SyntaxError tagged `type: 'entity.parse.failed'` (status 400) for invalid
  // JSON. Without this branch it falls through to the generic 500 below. Return
  // a clean, generic 400 — never echo the raw body or the parser's stack.
  if (isBodyParseError(err)) {
    log.warn({ code: 'INVALID_JSON' }, 'Malformed JSON request body');
    sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body.');
    return;
  }

  // 2. Zod errors that escaped the validation middleware.
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    log.warn({ details }, 'Unhandled validation error');
    sendError(res, 422, 'VALIDATION_ERROR', 'Validation failed', details);
    return;
  }

  // 3. JWT verification errors.
  if (err instanceof TokenExpiredError) {
    sendError(res, 401, 'TOKEN_EXPIRED', 'Authentication token expired');
    return;
  }
  if (err instanceof JsonWebTokenError) {
    sendError(res, 401, 'TOKEN_INVALID', 'Invalid authentication token');
    return;
  }

  // 4. Known Prisma errors mapped to clean client responses.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      // Unique constraint violation.
      sendError(res, 409, 'CONFLICT', 'Resource already exists');
      return;
    }
    if (err.code === 'P2025') {
      // Record not found.
      sendError(res, 404, 'NOT_FOUND', 'Resource not found');
      return;
    }
    log.error({ err, prismaCode: err.code }, 'Prisma known request error');
    sendError(res, 400, 'DB_REQUEST_ERROR', 'Database request error');
    return;
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    log.error({ err }, 'Prisma validation error');
    sendError(res, 400, 'DB_VALIDATION_ERROR', 'Invalid database query');
    return;
  }

  // 5. Anything else: unexpected. Log full detail, return opaque 500.
  log.error({ err }, 'Unhandled error');
  const message = config.isProd
    ? 'An unexpected error occurred'
    : err instanceof Error
      ? err.message
      : 'Unknown error';
  sendError(res, 500, 'INTERNAL_ERROR', message);
}
