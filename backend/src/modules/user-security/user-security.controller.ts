import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { securityService } from './user-security.service';
import type { AuthContext } from '../auth/auth.types';

function ctx(req: Request): AuthContext {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * User security controller (2FA / MFA + step-up). HTTP in, HTTP out. Secrets and
 * backup codes are returned ONLY by the setup/confirm/regenerate endpoints (one
 * time); status never returns them.
 */
export const securityController = {
  async status(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    sendSuccess(res, await securityService.status(req.user.id));
  },

  async setup(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await securityService.setup(req.user.id, ctx(req));
    sendSuccess(res, result);
  },

  async confirm(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await securityService.confirm(req.user.id, req.body.code, ctx(req));
    sendSuccess(res, result);
  },

  async disable(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    await securityService.disable(
      req.user.id,
      req.body.password,
      req.body.code,
      ctx(req),
    );
    sendSuccess(res, { disabled: true });
  },

  async regenerateBackupCodes(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await securityService.regenerateBackupCodes(
      req.user.id,
      req.body.code,
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async stepUp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await securityService.stepUp(
      req.user.id,
      { password: req.body.password, code: req.body.code },
      ctx(req),
    );
    sendSuccess(res, result);
  },
};
