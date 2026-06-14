import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../lib/errors';

/**
 * Terminal 404 handler for unmatched routes. Forwards a NotFoundError to the
 * central error handler so the response uses the standard envelope.
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
