import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminKycController } from './kyc.admin.controller';
import {
  kycDecisionSchema,
  kycNoteSchema,
  kycQueueQuerySchema,
  userIdParamSchema,
} from './kyc.validators';

/**
 * Admin KYC routes — every route sits behind adminAuthenticate + an explicit
 * permission check:
 *   kyc.view        → read the queue + a user's detail
 *   kyc.review      → approve / reject / request-info / add compliance note
 *   compliance.view → the compliance summary dashboard
 *
 * The static `/compliance/summary` route is registered BEFORE the dynamic
 * `/:userId` route so it is never shadowed by the uuid param matcher.
 */
export const adminKycRouter = Router();

adminKycRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('kyc.view'),
  validate({ query: kycQueueQuerySchema }),
  asyncHandler(adminKycController.queue),
);

adminKycRouter.get(
  '/compliance/summary',
  adminAuthenticate,
  adminAuthorize('compliance.view'),
  asyncHandler(adminKycController.compliance),
);

adminKycRouter.get(
  '/:userId',
  adminAuthenticate,
  adminAuthorize('kyc.view'),
  validate({ params: userIdParamSchema }),
  asyncHandler(adminKycController.detail),
);

adminKycRouter.post(
  '/:userId/decision',
  adminAuthenticate,
  adminAuthorize('kyc.review'),
  validate({ params: userIdParamSchema, body: kycDecisionSchema }),
  asyncHandler(adminKycController.decision),
);

adminKycRouter.post(
  '/:userId/note',
  adminAuthenticate,
  adminAuthorize('kyc.review'),
  validate({ params: userIdParamSchema, body: kycNoteSchema }),
  asyncHandler(adminKycController.note),
);
