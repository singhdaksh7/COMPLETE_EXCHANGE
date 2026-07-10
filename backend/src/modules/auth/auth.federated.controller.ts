import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { authFederatedService } from './auth.federated.service';
import type { AuthContext } from './auth.types';

function ctx(req: Request): AuthContext {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Federated identity (Google/Apple via Firebase) controller. HTTP in, HTTP
 * out only — all business logic lives in authFederatedService.
 */
export const authFederatedController = {
  async login(req: Request, res: Response): Promise<void> {
    const result = await authFederatedService.login({
      idToken: req.body.idToken,
      provider: req.body.provider,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: String(req.id),
      location: req.body.location,
    });
    sendSuccess(res, result);
  },

  async requestLinkOtp(req: Request, res: Response): Promise<void> {
    await authFederatedService.requestLinkOtp(req.body.challengeToken);
    // Enumeration-safe, generic response — mirrors forgotPassword/resendOtp.
    sendSuccess(res, { sent: true });
  },

  async confirmLink(req: Request, res: Response): Promise<void> {
    const result = await authFederatedService.confirmLink({
      challengeToken: req.body.challengeToken,
      otp: req.body.otp,
      ...ctx(req),
      location: req.body.location,
    });
    sendSuccess(res, result);
  },

  async completeRegistration(req: Request, res: Response): Promise<void> {
    const result = await authFederatedService.completeRegistration({
      challengeToken: req.body.challengeToken,
      phone: req.body.phone,
      acceptedPolicies: req.body.acceptedPolicies,
      ...ctx(req),
      location: req.body.location,
    });
    sendSuccess(res, result);
  },
};
