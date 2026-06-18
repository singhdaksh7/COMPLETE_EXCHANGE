import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminRbacController } from './admin-rbac.controller';
import {
  adminIdParamSchema,
  adminLoginSchema,
  adminRoleParamSchema,
  adminStatusSchema,
  createAdminSchema,
  createPermissionSchema,
  createRoleSchema,
  ipAllowlistSchema,
  permissionIdParamSchema,
  roleIdParamSchema,
  rolePermissionParamSchema,
  totpConfirmSchema,
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

// --- Self TOTP (re-)enrollment: any authenticated admin -------------------
adminRbacRouter.post(
  '/auth/totp/enroll',
  adminAuthenticate,
  asyncHandler(adminRbacController.enrollTotp),
);

adminRbacRouter.post(
  '/auth/totp/confirm',
  adminAuthenticate,
  validate({ body: totpConfirmSchema }),
  asyncHandler(adminRbacController.confirmTotp),
);

// --- Admin management: list (admin.view) + mutations (admin.manage) --------
adminRbacRouter.get(
  '/admins',
  adminAuthenticate,
  adminAuthorize('admin.view'),
  asyncHandler(adminRbacController.listAdmins),
);

adminRbacRouter.post(
  '/admins',
  adminAuthenticate,
  adminAuthorize('admin.manage'),
  validate({ body: createAdminSchema }),
  asyncHandler(adminRbacController.createAdmin),
);

adminRbacRouter.patch(
  '/admins/:adminId/status',
  adminAuthenticate,
  adminAuthorize('admin.manage'),
  validate({ params: adminIdParamSchema, body: adminStatusSchema }),
  asyncHandler(adminRbacController.setAdminStatus),
);

adminRbacRouter.post(
  '/admins/:adminId/totp/reset',
  adminAuthenticate,
  adminAuthorize('admin.manage'),
  validate({ params: adminIdParamSchema }),
  asyncHandler(adminRbacController.resetAdminTotp),
);

adminRbacRouter.put(
  '/admins/:adminId/ip-allowlist',
  adminAuthenticate,
  adminAuthorize('admin.manage'),
  validate({ params: adminIdParamSchema, body: ipAllowlistSchema }),
  asyncHandler(adminRbacController.setIpAllowlist),
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
