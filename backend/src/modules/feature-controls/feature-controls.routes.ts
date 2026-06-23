import { Router } from 'express';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { featureControlsController } from './feature-controls.controller';
import {
  updateControlsSchema,
  userIdParamSchema,
} from './feature-controls.validators';

/**
 * Per-user feature controls (User Control Center). Mounted at /users so the
 * paths are /users/:userId/controls (more specific than /users/:userId, so the
 * generic detail route does not shadow them).
 *
 *   view   → users.controls.view
 *   update → users.controls.update   (reason required; every change audited)
 */
export const adminFeatureControlsRouter = Router();

adminFeatureControlsRouter.get(
  '/:userId/controls',
  adminAuthenticate,
  adminAuthorize('users.controls.view'),
  validate({ params: userIdParamSchema }),
  asyncHandler(featureControlsController.get),
);

adminFeatureControlsRouter.patch(
  '/:userId/controls',
  adminAuthenticate,
  adminAuthorize('users.controls.update'),
  validate({ params: userIdParamSchema, body: updateControlsSchema }),
  asyncHandler(featureControlsController.update),
);

adminFeatureControlsRouter.get(
  '/:userId/controls/audit',
  adminAuthenticate,
  adminAuthorize('users.controls.view'),
  validate({ params: userIdParamSchema }),
  asyncHandler(featureControlsController.history),
);
