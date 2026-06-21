import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { complianceController } from './compliance.controller';
import { livenessVerifySchema, submitEnhancedKycSchema } from './compliance.validators';

/**
 * User-facing compliance / enhanced-KYC routes. Mounted at /api/v1/kyc ALONGSIDE
 * the legacy kycRouter (paths are distinct, so nothing is shadowed). Sensitive
 * endpoints carry the tighter authRateLimiter.
 *
 *   GET  /kyc/status            → enhanced compliance status (masked)
 *   POST /kyc/liveness/start    → open a (mock) liveness session
 *   POST /kyc/liveness/verify   → verify a liveness session
 *   POST /kyc/submit-enhanced   → submit identity/address/consents (PII masked)
 */
export const complianceRouter = Router();

complianceRouter.get('/status', authenticate, asyncHandler(complianceController.getStatus));

complianceRouter.post(
  '/liveness/start',
  authenticate,
  authRateLimiter,
  asyncHandler(complianceController.startLiveness),
);

complianceRouter.post(
  '/liveness/verify',
  authenticate,
  authRateLimiter,
  validate({ body: livenessVerifySchema }),
  asyncHandler(complianceController.verifyLiveness),
);

complianceRouter.post(
  '/submit-enhanced',
  authenticate,
  authRateLimiter,
  validate({ body: submitEnhancedKycSchema }),
  asyncHandler(complianceController.submitEnhanced),
);
