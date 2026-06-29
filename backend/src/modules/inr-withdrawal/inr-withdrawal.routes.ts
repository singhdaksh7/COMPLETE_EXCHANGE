import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { sensitiveRateLimiter } from '../../middleware/rate-limit';
import { requireUserFeature } from '../../middleware/require-user-feature';
import { requireStepUp } from '../../middleware/require-step-up';
import { inrWithdrawalController } from './inr-withdrawal.controller';
import {
  createWithdrawalSchema,
  withdrawalIdParamSchema,
  withdrawalQuerySchema,
} from './inr-withdrawal.validators';

/**
 * User-facing manual INR withdrawal routes, mounted at /inr/withdrawals.
 *   route → authenticate → [rate-limit] → validate → requireUserFeature →
 *           [idempotency] → controller → service
 *
 * The feature gate (canWithdrawInr) is enforced HERE — the UI toggle is only a
 * surface; a direct API call is blocked when the per-user OR global INR
 * withdrawal flag is off.
 */
export const inrWithdrawalRouter = Router();

inrWithdrawalRouter.post(
  '/',
  authenticate,
  sensitiveRateLimiter,
  validate({ body: createWithdrawalSchema }),
  requireUserFeature('canWithdrawInr'),
  // Step-up: a fresh TOTP/backup code (2FA users) or password (non-2FA users)
  // must have been verified to obtain the X-Step-Up-Token. Verification gate
  // only — the withdrawal lifecycle/accounting below is unchanged.
  requireStepUp(),
  idempotency(),
  asyncHandler(inrWithdrawalController.create),
);

inrWithdrawalRouter.get(
  '/',
  authenticate,
  validate({ query: withdrawalQuerySchema }),
  asyncHandler(inrWithdrawalController.list),
);

inrWithdrawalRouter.get(
  '/:id',
  authenticate,
  validate({ params: withdrawalIdParamSchema }),
  asyncHandler(inrWithdrawalController.get),
);
