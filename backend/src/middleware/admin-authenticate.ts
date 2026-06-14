import type { Request, Response, NextFunction } from 'express';
import { verifyAdminAccessToken } from '../lib/jwt';
import { UnauthorizedError } from '../lib/errors';
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
    req.admin = {
      id: admin.id,
      sessionId: payload.sid,
    };
    next();
  } catch (err) {
    next(err);
  }
}
