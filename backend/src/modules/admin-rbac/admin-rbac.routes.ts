import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminRbacController } from './admin-rbac.controller';
import {
  adminLoginSchema,
  adminRoleParamSchema,
  createPermissionSchema,
  createRoleSchema,
  permissionIdParamSchema,
  roleIdParamSchema,
  rolePermissionParamSchema,
  updatePermissionSchema,
  updateRoleSchema,
} from './admin-rbac.validators';

export const adminRbacRouter = Router();

adminRbacRouter.post(
  '/auth/login',
  authRateLimiter,
  validate({ body: adminLoginSchema }),
  asyncHandler(adminRbacController.login),
);

adminRbacRouter.get(
  '/auth/me',
  adminAuthenticate,
  asyncHandler(adminRbacController.me),
);

adminRbacRouter.get(
  '/roles',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  asyncHandler(adminRbacController.listRoles),
);

adminRbacRouter.post(
  '/roles',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  validate({ body: createRoleSchema }),
  asyncHandler(adminRbacController.createRole),
);

adminRbacRouter.patch(
  '/roles/:roleId',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  validate({ params: roleIdParamSchema, body: updateRoleSchema }),
  asyncHandler(adminRbacController.updateRole),
);

adminRbacRouter.delete(
  '/roles/:roleId',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  validate({ params: roleIdParamSchema }),
  asyncHandler(adminRbacController.deleteRole),
);

adminRbacRouter.get(
  '/permissions',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  asyncHandler(adminRbacController.listPermissions),
);

adminRbacRouter.post(
  '/permissions',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  validate({ body: createPermissionSchema }),
  asyncHandler(adminRbacController.createPermission),
);

adminRbacRouter.patch(
  '/permissions/:permissionId',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  validate({ params: permissionIdParamSchema, body: updatePermissionSchema }),
  asyncHandler(adminRbacController.updatePermission),
);

adminRbacRouter.delete(
  '/permissions/:permissionId',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  validate({ params: permissionIdParamSchema }),
  asyncHandler(adminRbacController.deletePermission),
);

adminRbacRouter.post(
  '/admins/:adminId/roles/:roleId',
  adminAuthenticate,
  adminAuthorize('admin.manage'),
  validate({ params: adminRoleParamSchema }),
  asyncHandler(adminRbacController.assignRoleToAdmin),
);

adminRbacRouter.delete(
  '/admins/:adminId/roles/:roleId',
  adminAuthenticate,
  adminAuthorize('admin.manage'),
  validate({ params: adminRoleParamSchema }),
  asyncHandler(adminRbacController.removeRoleFromAdmin),
);

adminRbacRouter.post(
  '/roles/:roleId/permissions/:permissionId',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  validate({ params: rolePermissionParamSchema }),
  asyncHandler(adminRbacController.grantPermissionToRole),
);

adminRbacRouter.delete(
  '/roles/:roleId/permissions/:permissionId',
  adminAuthenticate,
  adminAuthorize('role.manage'),
  validate({ params: rolePermissionParamSchema }),
  asyncHandler(adminRbacController.revokePermissionFromRole),
);
