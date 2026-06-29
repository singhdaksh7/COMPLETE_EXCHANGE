import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { sensitiveRateLimiter } from '../../middleware/rate-limit';
import { requireUserFeature } from '../../middleware/require-user-feature';
import { requireStepUp } from '../../middleware/require-step-up';
import { withdrawalController } from './withdrawal.controller';
import {
  addAddressSchema,
  addressQuerySchema,
  createWithdrawalSchema,
  withdrawalIdParamSchema,
  withdrawalQuerySchema,
} from './withdrawal.validators';

/**
 * User-facing crypto withdrawal routes, mounted at /withdrawals.
 * Static `/addresses` paths are declared before `/:id` so they are not shadowed.
 */
export const withdrawalRouter = Router();

withdrawalRouter.post(
  '/addresses',
  authenticate,
  // Step-up before changing the withdrawal address allowlist (sensitive action).
  // Crypto remains globally disabled by the feature gate on the request route;
  // this only adds a verification gate and does not enable crypto.
  requireStepUp(),
  validate({ body: addAddressSchema }),
  asyncHandler(withdrawalController.addAddress),
);

withdrawalRouter.get(
  '/addresses',
  authenticate,
  validate({ query: addressQuerySchema }),
  asyncHandler(withdrawalController.listAddresses),
);

withdrawalRouter.post(
  '/',
  authenticate,
  sensitiveRateLimiter,
  validate({ body: createWithdrawalSchema }),
  // Per-user feature controls: crypto withdrawal + high-risk gates. The
  // existing freeze / KYC / withdrawals-block checks in the service still apply
  // on top of these. `manualReviewBeforeWithdrawal` is intentionally NOT a hard
  // block here — crypto withdrawals already enter PENDING_APPROVAL dual-control
  // review, which satisfies the "manual review before withdrawal" requirement.
  requireUserFeature('canWithdrawCrypto', 'blockHighRiskActivity'),
  // Step-up verification gate (fresh TOTP/backup or password). Verification only;
  // the withdrawal lifecycle/accounting in the service is unchanged.
  requireStepUp(),
  idempotency(),
  asyncHandler(withdrawalController.create),
);

withdrawalRouter.get(
  '/',
  authenticate,
  validate({ query: withdrawalQuerySchema }),
  asyncHandler(withdrawalController.list),
);

withdrawalRouter.get(
  '/:id',
  authenticate,
  validate({ params: withdrawalIdParamSchema }),
  asyncHandler(withdrawalController.get),
);
