import { Router } from 'express';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminSensitiveRateLimiter } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { adminUsersController } from './admin-users.controller';
import {
  accountStatusSchema,
  adminUserListQuerySchema,
  archiveUserSchema,
  restoreUserSchema,
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

// Stage 9C — Deleted / Archived Users tab. SUPER_ADMIN-only (users.viewArchived
// is granted to no other role). Registered BEFORE '/:userId' so the literal
// '/archived' path is never captured by the id param.
adminUsersRouter.get(
  '/archived',
  adminAuthenticate,
  adminAuthorize('users.viewArchived'),
  validate({ query: adminUserListQuerySchema }),
  asyncHandler(adminUsersController.listArchived),
);

adminUsersRouter.get(
  '/archived/:userId',
  adminAuthenticate,
  adminAuthorize('users.viewArchived'),
  validate({ params: userIdParamSchema }),
  asyncHandler(adminUsersController.archivedDetail),
);

adminUsersRouter.get(
  '/:userId',
  adminAuthenticate,
  adminAuthorize('users.view'),
  validate({ params: userIdParamSchema }),
  asyncHandler(adminUsersController.detail),
);

// Stage 9C — soft-delete (archive) + restore. SUPER_ADMIN-only (users.archive
// is granted to no other role); the service re-checks the role as defence in
// depth and blocks archive while funds/pending/obligations exist.
adminUsersRouter.post(
  '/:userId/archive',
  adminAuthenticate,
  adminAuthorize('users.archive'),
  adminSensitiveRateLimiter,
  validate({ params: userIdParamSchema, body: archiveUserSchema }),
  asyncHandler(adminUsersController.archive),
);

adminUsersRouter.post(
  '/:userId/restore',
  adminAuthenticate,
  adminAuthorize('users.archive'),
  adminSensitiveRateLimiter,
  validate({ params: userIdParamSchema, body: restoreUserSchema }),
  asyncHandler(adminUsersController.restore),
);

// Stage 9E — sensitive admin mutation: user lock/unlock (account status).
// Throttled in the dedicated admin-sensitive bucket.
adminUsersRouter.patch(
  '/:userId/status',
  adminAuthenticate,
  adminAuthorize('users.manage'),
  adminSensitiveRateLimiter,
  validate({ params: userIdParamSchema, body: accountStatusSchema }),
  asyncHandler(adminUsersController.setStatus),
);

// Stage 9E — sensitive admin mutation: withdrawal block toggle.
adminUsersRouter.patch(
  '/:userId/withdrawals-block',
  adminAuthenticate,
  adminAuthorize('risk.manage'),
  adminSensitiveRateLimiter,
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
