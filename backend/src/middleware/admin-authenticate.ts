import type { Request, Response, NextFunction } from 'express';
import { verifyAdminAccessToken } from '../lib/jwt';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { isIpAllowed } from '../lib/ip-allowlist';
import { adminRbacService } from '../modules/admin-rbac/admin-rbac.service';

export async function adminAuthenticate(
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
    const payload = verifyAdminAccessToken(token);
    const admin = await adminRbacService.validateAdminSession(
      payload.sub,
      payload.sid,
    );
    // Per-admin IP allowlist: enforced on EVERY request, not just login, so a
    // token issued earlier cannot be replayed from a now-disallowed IP.
    if (!isIpAllowed(req.ip, admin.ipAllowlist)) {
      throw new ForbiddenError(
        'Admin access is not permitted from this IP address',
        'IP_NOT_ALLOWED',
      );
    }
    req.admin = {
      id: admin.id,
      sessionId: payload.sid,
    };
    next();
  } catch (err) {
    next(err);
  }
}
