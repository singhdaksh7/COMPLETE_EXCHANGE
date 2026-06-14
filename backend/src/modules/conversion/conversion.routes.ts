import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { conversionController } from './conversion.controller';
import {
  createConversionSchema,
  createQuoteSchema,
  historyQuerySchema,
} from './conversion.validators';

/**
 * User-facing conversion routes, mounted at /inr (alongside the INR ledger
 * router): POST /inr/quotes, POST /inr/conversions, GET /inr/conversions.
 */
export const conversionRouter = Router();

conversionRouter.post(
  '/quotes',
  authenticate,
  validate({ body: createQuoteSchema }),
  asyncHandler(conversionController.quote),
);

conversionRouter.post(
  '/conversions',
  authenticate,
  validate({ body: createConversionSchema }),
  idempotency(),
  asyncHandler(conversionController.convert),
);

conversionRouter.get(
  '/conversions',
  authenticate,
  validate({ query: historyQuerySchema }),
  asyncHandler(conversionController.history),
);
