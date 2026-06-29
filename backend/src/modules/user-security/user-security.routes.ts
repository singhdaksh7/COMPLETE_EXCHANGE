import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { securityController } from './user-security.controller';
import {
  confirm2faSchema,
  disable2faSchema,
  regenerateBackupCodesSchema,
  stepUpSchema,
} from './user-security.validators';

/**
 * User security routes (2FA / MFA + step-up), mounted at /security.
 *   route → authenticate → [authRateLimiter] → validate → controller
 *
 * Every endpoint is authenticated (the acting user is req.user). Verification
 * endpoints carry the tight authRateLimiter to blunt brute force; the service
 * additionally rate-limits failed second-factor attempts per user.
 */
export const securityRouter = Router();

securityRouter.get(
  '/2fa/status',
  authenticate,
  asyncHandler(securityController.status),
);

securityRouter.post(
  '/2fa/setup',
  authenticate,
  authRateLimiter,
  asyncHandler(securityController.setup),
);

securityRouter.post(
  '/2fa/confirm',
  authenticate,
  authRateLimiter,
  validate({ body: confirm2faSchema }),
  asyncHandler(securityController.confirm),
);

securityRouter.post(
  '/2fa/disable',
  authenticate,
  authRateLimiter,
  validate({ body: disable2faSchema }),
  asyncHandler(securityController.disable),
);

securityRouter.post(
  '/2fa/backup-codes/regenerate',
  authenticate,
  authRateLimiter,
  validate({ body: regenerateBackupCodesSchema }),
  asyncHandler(securityController.regenerateBackupCodes),
);

// Step-up: verify a fresh factor → short-lived step-up token for sensitive
// actions (e.g. INR withdrawal). Tightly rate-limited.
securityRouter.post(
  '/step-up',
  authenticate,
  authRateLimiter,
  validate({ body: stepUpSchema }),
  asyncHandler(securityController.stepUp),
);
