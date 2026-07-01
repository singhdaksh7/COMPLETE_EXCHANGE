import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { UnauthorizedError } from '../lib/errors';
import { authRedisGet } from '../lib/redis';
import { authService } from '../modules/auth/auth.service';

/**
 * Authentication middleware.
 *
 * Verifies the Bearer access token and attaches `req.user`. Beyond signature
 * verification it checks a Redis revocation list, so a logged-out / revoked
 * session is rejected immediately even though its JWT has not yet expired
 * (instant revocation is a hard requirement for a custodial app — see §11).
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = header.slice('Bearer '.length).trim();
    const payload = verifyAccessToken(token);

    // Redis is only the fast path. The DB check below is the authority.
    const revoked = await authRedisGet(`session:revoked:${payload.sid}`).catch(
      () => null,
    );
    if (revoked) {
      // Stage 7B: a session revoked by a newer login (single active session
      // policy) gets a specific, user-friendly message + code so the client can
      // explain WHY the user was signed out.
      if (revoked === 'NEW_LOGIN') {
        throw new UnauthorizedError(
          'Your session was signed out because your account was opened on another device.',
          'SESSION_REVOKED_BY_NEW_LOGIN',
        );
      }
      throw new UnauthorizedError('Session has been revoked', 'SESSION_REVOKED');
    }

    const user = await authService.validateAccessSession(payload.sub, payload.sid);

    req.user = {
      id: user.id,
      sessionId: payload.sid,
      kycTier: user.kycTier,
    };
    next();
  } catch (err) {
    next(err);
  }
}
