import { Router } from 'express';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { adminUsersController } from './admin-users.controller';
import {
  accountStatusSchema,
  adminUserListQuerySchema,
  riskProfileSchema,
  userIdParamSchema,
  withdrawalBlockSchema,
} from './admin-users.validators';

export const adminUsersRouter = Router();

adminUsersRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('users.view'),
  validate({ query: adminUserListQuerySchema }),
  asyncHandler(adminUsersController.list),
);

adminUsersRouter.get(
  '/:userId',
  adminAuthenticate,
  adminAuthorize('users.view'),
  validate({ params: userIdParamSchema }),
  asyncHandler(adminUsersController.detail),
);

adminUsersRouter.patch(
  '/:userId/status',
  adminAuthenticate,
  adminAuthorize('users.manage'),
  validate({ params: userIdParamSchema, body: accountStatusSchema }),
  asyncHandler(adminUsersController.setStatus),
);

adminUsersRouter.patch(
  '/:userId/withdrawals-block',
  adminAuthenticate,
  adminAuthorize('risk.manage'),
  validate({ params: userIdParamSchema, body: withdrawalBlockSchema }),
  asyncHandler(adminUsersController.setWithdrawalBlock),
);

adminUsersRouter.patch(
  '/:userId/risk',
  adminAuthenticate,
  adminAuthorize('risk.manage'),
  validate({ params: userIdParamSchema, body: riskProfileSchema }),
  asyncHandler(adminUsersController.updateRisk),
);
