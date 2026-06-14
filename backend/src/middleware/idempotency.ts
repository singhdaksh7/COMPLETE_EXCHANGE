import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from '../lib/errors';

/**
 * Idempotency middleware for money-moving POSTs (deposits, conversions,
 * withdrawals) and any endpoint a client may safely retry.
 *
 * Contract (ARCHITECTURE.md §6.3):
 *   - The client sends a unique `Idempotency-Key` header per logical operation.
 *   - We persist `(user_id, endpoint, key) -> (status, body)`.
 *   - A replay with the same key returns the ORIGINAL response without
 *     re-executing the handler.
 *   - A replay that arrives while the first is still in flight gets 409.
 *
 * Concurrency is resolved by the unique constraint on
 * `(user_id, endpoint, key)`: the first request inserts a placeholder row; a
 * racing duplicate hits the unique violation and is treated as in-flight.
 *
 * Must be mounted AFTER `authenticate` (the key is namespaced per user) and
 * AFTER validation, but BEFORE the controller.
 */

const KEY_MIN = 8;
const KEY_MAX = 255;

/** Stable endpoint identity: method + mounted route, query string excluded. */
function endpointId(req: Request): string {
  const routePath = req.route?.path ?? req.path;
  return `${req.method}:${req.baseUrl}${routePath}`;
}

export function idempotency() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const headerVal = req.header('Idempotency-Key');
      if (!headerVal) {
        throw new BadRequestError(
          'Idempotency-Key header is required for this operation',
          { header: 'Idempotency-Key' },
        );
      }
      const key = headerVal.trim();
      if (key.length < KEY_MIN || key.length > KEY_MAX) {
        throw new BadRequestError('Idempotency-Key has an invalid length', {
          header: 'Idempotency-Key',
          min: KEY_MIN,
          max: KEY_MAX,
        });
      }

      const userId = req.user.id;
      const endpoint = endpointId(req);

      // Fast path: a completed record exists → replay it verbatim.
      const existing = await prisma.idempotencyKey.findUnique({
        where: { userId_endpoint_key: { userId, endpoint, key } },
      });

      if (existing) {
        if (existing.responseStatus === null) {
          // The original request is still being processed.
          throw new ConflictError(
            'A request with this Idempotency-Key is still being processed',
            'IDEMPOTENCY_IN_PROGRESS',
          );
        }
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(existing.responseStatus).json(existing.responseBody);
        return;
      }

      // Claim the key by inserting a placeholder (response_status = null). If a
      // concurrent request already claimed it, the unique index rejects us.
      try {
        await prisma.idempotencyKey.create({
          data: { userId, endpoint, key },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictError(
            'A request with this Idempotency-Key is already in progress',
            'IDEMPOTENCY_IN_PROGRESS',
          );
        }
        throw err;
      }

      // Capture the final response so future replays can return it. We persist
      // on `finish` (when status + body are settled). 5xx responses are NOT
      // persisted — instead the claim is released so the client may retry the
      // same key against a transient failure.
      let capturedBody: unknown;
      const originalJson = res.json.bind(res);
      res.json = (body: unknown): Response => {
        capturedBody = body;
        return originalJson(body);
      };

      res.on('finish', () => {
        const status = res.statusCode;
        void (async () => {
          try {
            if (status >= 500) {
              await prisma.idempotencyKey.deleteMany({
                where: { userId, endpoint, key, responseStatus: null },
              });
              return;
            }
            await prisma.idempotencyKey.update({
              where: { userId_endpoint_key: { userId, endpoint, key } },
              data: {
                responseStatus: status,
                responseBody:
                  capturedBody === undefined
                    ? Prisma.JsonNull
                    : (capturedBody as Prisma.InputJsonValue),
              },
            });
          } catch (persistErr) {
            req.log?.error(
              { err: persistErr, endpoint, key },
              'Failed to persist idempotency result',
            );
          }
        })();
      });

      next();
    } catch (err) {
      next(err);
    }
  };
}
