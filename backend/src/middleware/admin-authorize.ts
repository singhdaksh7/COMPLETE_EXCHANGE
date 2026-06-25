import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { adminRbacService } from '../modules/admin-rbac/admin-rbac.service';

export function adminAuthorize(...required: string[]) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.admin) throw new UnauthorizedError();
      const { roles, permissions } = await adminRbacService.getAdminPermissions(
        req.admin.id,
      );
      req.admin.roles = roles;
      req.admin.permissions = permissions;
      if (roles.includes('SUPER_ADMIN')) {
        next();
        return;
      }
      const missing = required.filter((p) => !permissions.includes(p));
      if (missing.length > 0) {
        throw new ForbiddenError(
          'You do not have permission to perform this admin action',
          'FORBIDDEN',
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * ANY-of authorization: the admin passes if they hold AT LEAST ONE of the
 * listed permissions (vs. {@link adminAuthorize}, which requires ALL of them).
 *
 * Used by Stage 9 read-only operational surfaces that are reachable by either
 * the operations admin (`operations.view`) or the system/ops viewer
 * (`system.view`) — e.g. system readiness, backup status, monitoring status.
 * SUPER_ADMIN always bypasses, consistent with `adminAuthorize`.
 */
export function adminAuthorizeAny(...anyOf: string[]) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.admin) throw new UnauthorizedError();
      const { roles, permissions } = await adminRbacService.getAdminPermissions(
        req.admin.id,
      );
      req.admin.roles = roles;
      req.admin.permissions = permissions;
      if (roles.includes('SUPER_ADMIN')) {
        next();
        return;
      }
      const allowed = anyOf.some((p) => permissions.includes(p));
      if (!allowed) {
        throw new ForbiddenError(
          'You do not have permission to perform this admin action',
          'FORBIDDEN',
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
