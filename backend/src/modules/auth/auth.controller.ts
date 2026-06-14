import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { authService } from './auth.service';
import { UnauthorizedError } from '../../lib/errors';
import type { AuthContext } from './auth.types';

/** Pull request-scoped forensic context for audit logging. */
function ctx(req: Request): AuthContext {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Controller layer: HTTP in, HTTP out. It extracts request data, calls the
 * service, and shapes the response envelope. NO business logic lives here.
 */
export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body, ctx(req));
    sendSuccess(res, result, 201);
  },

  async verifyEmail(req: Request, res: Response): Promise<void> {
    const user = await authService.verifyEmail(req.body.token, ctx(req));
    sendSuccess(res, { user });
  },

  async resendVerification(req: Request, res: Response): Promise<void> {
    await authService.resendVerification(req.body.email, ctx(req));
    // Generic response — never reveals whether the account exists.
    sendSuccess(res, { sent: true });
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login({
      email: req.body.email,
      password: req.body.password,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: String(req.id),
    });
    sendSuccess(res, result);
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const tokens = await authService.refresh(req.body.refreshToken, ctx(req));
    sendSuccess(res, { tokens });
  },

  async logout(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    await authService.logout(req.user.sessionId, ctx(req));
    sendSuccess(res, { loggedOut: true });
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    await authService.forgotPassword(req.body.email, ctx(req));
    sendSuccess(res, { sent: true });
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    await authService.resetPassword(req.body.token, req.body.password, ctx(req));
    sendSuccess(res, { reset: true });
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    await authService.changePassword(
      req.user.id,
      req.user.sessionId,
      req.body.currentPassword,
      req.body.newPassword,
      ctx(req),
    );
    sendSuccess(res, { changed: true });
  },

  async listSessions(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const items = await authService.listSessions(
      req.user.id,
      req.user.sessionId,
    );
    sendSuccess(res, { items });
  },

  async revokeSession(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    await authService.revokeSession(
      req.user.id,
      req.params.sessionId,
      ctx(req),
    );
    sendSuccess(res, { revoked: true });
  },

  async me(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await authService.me(req.user.id);
    sendSuccess(res, result);
  },
};
