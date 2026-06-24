import { Router } from 'express';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { adminUserProfileController } from './admin-user-profile.controller';
import {
  sectionParamSchema,
  sectionQuerySchema,
  userIdParamSchema,
} from './admin-user-profile.validators';

/**
 * Admin "full user profile" aggregate (Stage 5). Mounted at /users so the paths
 * are /users/:userId/profile and /users/:userId/profile/sections/:section. Both
 * are MORE specific than the generic /users/:userId detail route, so they do not
 * shadow (and are not shadowed by) it.
 *
 *   profile  → users.view  (risk/compliance sub-sections additionally gated by
 *              compliance.view, enforced inside the controller/service)
 *   sections → users.view  (cursor-paginated drill-down for large sections)
 */
export const adminUserProfileRouter = Router();

adminUserProfileRouter.get(
  '/:userId/profile',
  adminAuthenticate,
  adminAuthorize('users.view'),
  validate({ params: userIdParamSchema }),
  asyncHandler(adminUserProfileController.profile),
);

adminUserProfileRouter.get(
  '/:userId/profile/sections/:section',
  adminAuthenticate,
  adminAuthorize('users.view'),
  validate({ params: sectionParamSchema, query: sectionQuerySchema }),
  asyncHandler(adminUserProfileController.section),
);
