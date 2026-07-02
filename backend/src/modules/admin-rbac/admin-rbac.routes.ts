import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize, adminAuthorizeAny } from '../../middleware/admin-authorize';
import { adminRbacController } from './admin-rbac.controller';
import {
  adminActivityQuerySchema,
  adminChangePasswordSchema,
  adminIdParamSchema,
  adminLoginSchema,
  adminRoleParamSchema,
  adminStatusSchema,
  createAdminSchema,
  createPermissionSchema,
  createRoleSchema,
  deactivateAdminSchema,
  ipAllowlistSchema,
  permissionIdParamSchema,
  reactivateAdminSchema,
  resetAdminPasswordSchema,
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

// Self-service password change (Stage 9C). Reachable even when the admin is in
// the mustChangePassword state (allow-listed in adminAuthenticate) so a forced
// reset can be cleared. Clears the flag and revokes all sessions on success.
adminRbacRouter.post(
  '/auth/change-password',
  adminAuthenticate,
  authRateLimiter,
  validate({ body: adminChangePasswordSchema }),
  asyncHandler(adminRbacController.changePassword),
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
  // Either the legacy admin.view or the Stage 7A admins.view (read-only
  // accountability) may list admins so a COMPLIANCE_OFFICER can reach profiles.
  adminAuthorizeAny('admin.view', 'admins.view'),
  asyncHandler(adminRbacController.listAdmins),
);

// Deleted / Archived Admins tab (Stage 9C). SUPER_ADMIN-only
// (admins.viewArchived granted to no other role). Registered before the
// '/admins/:adminId/...' routes so the literal path is never shadowed.
adminRbacRouter.get(
  '/admins/archived',
  adminAuthenticate,
  adminAuthorize('admins.viewArchived'),
  asyncHandler(adminRbacController.listArchivedAdmins),
);

adminRbacRouter.post(
  '/admins',
  adminAuthenticate,
  adminAuthorize('admin.manage'),
  validate({ body: createAdminSchema }),
  asyncHandler(adminRbacController.createAdmin),
);

// SUPER_ADMIN resets another admin's password (Stage 9C). admins.passwordReset
// is granted to no other role; the service also re-checks SUPER_ADMIN, refuses
// self-reset, and refuses archived targets. Throttled in the auth bucket.
adminRbacRouter.post(
  '/admins/:adminId/password-reset',
  adminAuthenticate,
  adminAuthorize('admins.passwordReset'),
  authRateLimiter,
  validate({ params: adminIdParamSchema, body: resetAdminPasswordSchema }),
  asyncHandler(adminRbacController.resetAdminPassword),
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

// --- Admin lifecycle (Stage 7A) --------------------------------------------
// Soft deactivation / reactivation are the highest-privilege admin actions.
// The route permission (`admins.deactivate` / `admins.reactivate`) is granted
// to NO non-super role in the RBAC baseline, so only SUPER_ADMIN passes here;
// the service additionally re-checks the SUPER_ADMIN role as defence in depth.
adminRbacRouter.post(
  '/admins/:adminId/deactivate',
  adminAuthenticate,
  adminAuthorize('admins.deactivate'),
  validate({ params: adminIdParamSchema, body: deactivateAdminSchema }),
  asyncHandler(adminRbacController.deactivateAdmin),
);

adminRbacRouter.post(
  '/admins/:adminId/reactivate',
  adminAuthenticate,
  adminAuthorize('admins.reactivate'),
  validate({ params: adminIdParamSchema, body: reactivateAdminSchema }),
  asyncHandler(adminRbacController.reactivateAdmin),
);

// Read-only accountability views. `admins.security.view` / `admins.activity.view`
// are granted read-only to COMPLIANCE_OFFICER (and SUPER_ADMIN by bypass).
adminRbacRouter.get(
  '/admins/:adminId/profile',
  adminAuthenticate,
  adminAuthorize('admins.security.view'),
  validate({ params: adminIdParamSchema }),
  asyncHandler(adminRbacController.adminProfile),
);

adminRbacRouter.get(
  '/admins/:adminId/activity',
  adminAuthenticate,
  adminAuthorize('admins.activity.view'),
  validate({ params: adminIdParamSchema, query: adminActivityQuerySchema }),
  asyncHandler(adminRbacController.adminActivity),
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
