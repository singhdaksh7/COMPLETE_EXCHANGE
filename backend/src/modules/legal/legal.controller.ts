import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { legalService } from './legal.service';
import type { LegalAcceptDto } from './legal.validators';
import {
  REQUIRED_SIGNUP_POLICIES,
  isConsentEnforced,
  missingRequiredPolicies,
} from './legal.consent';

/** User-facing legal controller (documents + own acceptances). */
export const legalController = {
  async currentDocuments(_req: Request, res: Response): Promise<void> {
    const docs = await legalService.currentDocuments();
    sendSuccess(res, { items: docs });
  },

  async accept(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const body = req.body as LegalAcceptDto;
    const acceptance = await legalService.accept(req.user.id, body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: String(req.id),
    });
    sendSuccess(res, acceptance, 201);
  },

  async myAcceptances(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const items = await legalService.acceptancesForUser(req.user.id);
    sendSuccess(res, { items });
  },

  /**
   * Stage 9A — consent status for the post-login banner. Tells the client which
   * required policies are still outstanding (empty = up to date) and whether the
   * gate is enforced, so it can prompt for acceptance before financial actions.
   */
  async consentStatus(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const missing = await missingRequiredPolicies(req.user.id);
    sendSuccess(res, {
      required: REQUIRED_SIGNUP_POLICIES,
      missing,
      upToDate: missing.length === 0,
      enforced: isConsentEnforced(),
    });
  },
};
