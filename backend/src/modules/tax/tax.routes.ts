import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { taxController } from './tax.controller';
import { taxProfileUserSchema, taxSummaryQuerySchema } from './tax.validators';

/**
 * User-facing tax routes (mounted at /tax). Every route is authenticated and
 * scoped to the caller. Tax/TDS here is CALCULATION-ONLY (staging) — nothing is
 * filed and no ledger balance is deducted.
 */
export const taxRouter = Router();

taxRouter.get('/profile', authenticate, asyncHandler(taxController.getProfile));
taxRouter.post('/profile', authenticate, validate({ body: taxProfileUserSchema }), asyncHandler(taxController.setProfile));
taxRouter.get('/summary', authenticate, validate({ query: taxSummaryQuerySchema }), asyncHandler(taxController.summary));
taxRouter.get('/statements', authenticate, asyncHandler(taxController.statements));
