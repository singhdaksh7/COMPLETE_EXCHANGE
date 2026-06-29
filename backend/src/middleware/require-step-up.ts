import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../lib/errors';
import { securityService } from '../modules/user-security/user-security.service';

/**
 * Step-up authentication guard for sensitive user actions (e.g. INR withdrawal).
 *
 * The client must first call POST /security/step-up (verifying a fresh TOTP/
 * backup code if 2FA is enabled, otherwise the account password) to obtain a
 * short-lived step-up token, then send it on the sensitive request via the
 * `X-Step-Up-Token` header. This middleware validates that token is still within
 * its window and bound to the calling user.
 *
 * It performs ONLY a verification gate — it never touches the withdrawal
 * lifecycle, ledger, or accounting. Mount it AFTER `authenticate`.
 */
export function requireStepUp() {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const header = req.header('X-Step-Up-Token');
      const token = header?.trim();
      const ok = await securityService.hasValidStepUp(req.user.id, token);
      if (!ok) {
        // The client obtains a step-up token from POST /security/step-up (which
        // prompts for TOTP/backup if 2FA is on, else the account password) and
        // retries with the X-Step-Up-Token header. It can read 2FA state from
        // GET /security/2fa/status to choose the prompt.
        throw new UnauthorizedError(
          'Additional verification is required to authorize this action',
          'STEP_UP_REQUIRED',
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
