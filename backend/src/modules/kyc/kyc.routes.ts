import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { kycController } from './kyc.controller';
import { kycDocumentSchema, kycSubmitSchema } from './kyc.validators';

/**
 * User-facing KYC routes.
 *   route → authenticate → rate-limit → validate → controller → service → repo
 *
 * Submission endpoints carry the tighter `authRateLimiter` because they accept
 * PII and create review work (OpenAPI marks them `sensitive`).
 */
export const kycRouter = Router();

// Provider server-to-server webhook (signature-verified, no user auth). Mounted
// BEFORE the authenticated routes since the provider cannot present a user JWT.
kycRouter.post('/webhook', asyncHandler(kycController.webhook));

kycRouter.get('/', authenticate, asyncHandler(kycController.getStatus));

kycRouter.post(
  '/',
  authenticate,
  authRateLimiter,
  validate({ body: kycSubmitSchema }),
  asyncHandler(kycController.submitProfile),
);

kycRouter.post(
  '/refresh',
  authenticate,
  authRateLimiter,
  asyncHandler(kycController.refresh),
);

kycRouter.get('/documents', authenticate, asyncHandler(kycController.listDocuments));

kycRouter.post(
  '/documents',
  authenticate,
  authRateLimiter,
  validate({ body: kycDocumentSchema }),
  asyncHandler(kycController.submitDocument),
);
