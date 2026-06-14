import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger';

/**
 * Assigns a correlation id to every request and binds a child logger to it.
 *
 * The id flows through logs (and, in later modules, jobs and webhook
 * processing) so a single user action is traceable end-to-end. An inbound
 * `x-request-id` is honoured (for tracing across the proxy), otherwise a new
 * UUID is generated. The id is echoed back in the response header.
 */
export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : randomUUID();

  req.id = requestId;
  req.log = logger.child({ requestId });
  res.setHeader('x-request-id', requestId);

  next();
}
