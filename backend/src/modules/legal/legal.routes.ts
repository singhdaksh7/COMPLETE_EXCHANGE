import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { legalController } from './legal.controller';
import { legalAcceptSchema } from './legal.validators';

/**
 * User-facing legal routes (mounted at /legal). Current documents are public;
 * accepting and reading own acceptances require authentication.
 */
export const legalRouter = Router();

legalRouter.get('/documents/current', asyncHandler(legalController.currentDocuments));
legalRouter.post('/accept', authenticate, validate({ body: legalAcceptSchema }), asyncHandler(legalController.accept));
legalRouter.get('/acceptances/me', authenticate, asyncHandler(legalController.myAcceptances));
// Stage 9A — consent status for the post-login banner + financial-action gate.
legalRouter.get('/consent-status', authenticate, asyncHandler(legalController.consentStatus));
