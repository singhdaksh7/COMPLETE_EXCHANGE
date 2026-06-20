import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { authRedisCall } from '../lib/redis';
import { config } from '../config';
import { sendError } from '../utils/response';

/**
 * Redis-backed rate limiting so limits are shared across all API instances
 * (an in-memory limiter would let a user multiply their quota by the number
 * of replicas).
 *
 * Three tiers:
 *  - `globalRateLimiter`:    broad protection on the whole API.
 *  - `authRateLimiter`:      much tighter, for auth endpoints (login, OTP,
 *    password reset) to blunt credential stuffing / brute force.
 *  - `sensitiveRateLimiter`: for authenticated money-movement submissions
 *    (withdrawal request, manual INR deposit submit) to blunt abuse/spam.
 *    Keyed in its own Redis namespace so it never shares a bucket with auth.
 */
function buildLimiter(
  max: number,
  prefix: string,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // ioredis exposes `call`; rate-limit-redis expects a sendCommand fn.
      // Split the first arg out so TS knows `call` always gets a command.
      sendCommand: (command: string, ...args: string[]) =>
        authRedisCall(command, ...args) as Promise<never>,
      prefix: `rl:${prefix}:`,
    }),
    handler: (_req, res) => {
      sendError(
        res,
        429,
        'RATE_LIMITED',
        'Too many requests, please try again later.',
      );
    },
  });
}

export const globalRateLimiter = buildLimiter(config.rateLimit.max, 'global');
export const authRateLimiter = buildLimiter(config.rateLimit.authMax, 'auth');
// Reuses the (tight) auth cap but in a separate bucket so a user's withdrawal /
// deposit submissions never consume — or get consumed by — their auth quota.
export const sensitiveRateLimiter = buildLimiter(config.rateLimit.authMax, 'sensitive');
