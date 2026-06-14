import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminKycController } from './kyc.admin.controller';
import {
  kycDecisionSchema,
  kycQueueQuerySchema,
  userIdParamSchema,
} from './kyc.validators';

/**
 * Admin KYC routes — every route sits behind adminAuthenticate + an explicit
 * permission check (kyc.view to read the queue, kyc.review to decide).
 */
export const adminKycRouter = Router();

adminKycRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('kyc.view'),
  validate({ query: kycQueueQuerySchema }),
  asyncHandler(adminKycController.queue),
);

adminKycRouter.post(
  '/:userId/decision',
  adminAuthenticate,
  adminAuthorize('kyc.review'),
  validate({ params: userIdParamSchema, body: kycDecisionSchema }),
  asyncHandler(adminKycController.decision),
);
