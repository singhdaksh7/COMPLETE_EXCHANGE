import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { depositController } from './deposit.controller';
import {
  createDepositSchema,
  createManualDepositSchema,
  depositIdParamSchema,
  depositQuerySchema,
  verifyPaymentSchema,
} from './deposit.validators';

/**
 * User-facing INR deposit routes, mounted at /inr/deposits.
 *   route → authenticate → validate → [idempotency] → controller → service
 *
 * The webhook is the lone exception: it is unauthenticated (Razorpay cannot
 * present a user JWT) and is instead authenticated by HMAC signature inside the
 * service, so it is registered BEFORE the authenticated routes.
 */
export const depositRouter = Router();

// Razorpay server-to-server webhook (signature-verified, no user auth).
depositRouter.post('/webhook', asyncHandler(depositController.webhook));

depositRouter.post(
  '/',
  authenticate,
  validate({ body: createDepositSchema }),
  idempotency(),
  asyncHandler(depositController.create),
);

// Manual INR deposit submission (amount + UTR). Idempotency middleware guards a
// double-tap of the same request; the DB-level unique (provider, utr) guards a
// genuinely duplicate UTR across separate requests.
depositRouter.post(
  '/manual',
  authenticate,
  validate({ body: createManualDepositSchema }),
  idempotency(),
  asyncHandler(depositController.createManual),
);

depositRouter.post(
  '/verify',
  authenticate,
  validate({ body: verifyPaymentSchema }),
  asyncHandler(depositController.verify),
);

depositRouter.get(
  '/',
  authenticate,
  validate({ query: depositQuerySchema }),
  asyncHandler(depositController.list),
);

depositRouter.get(
  '/:id',
  authenticate,
  validate({ params: depositIdParamSchema }),
  asyncHandler(depositController.get),
);
