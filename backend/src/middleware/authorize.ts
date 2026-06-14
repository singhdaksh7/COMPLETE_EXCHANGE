import type { Request, Response, NextFunction } from 'express';
import { authService } from '../modules/auth/auth.service';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

/**
 * RBAC authorization middleware factory.
 *
 * Must run AFTER `authenticate` (it relies on `req.user`). It resolves the
 * principal's effective permissions (role → permission codes, cached briefly in
 * Redis) and requires that ALL listed permission codes are present. The
 * resolved roles/permissions are attached to `req.user` for downstream use.
 *
 *   router.post('/x', authenticate, authorize('withdrawal.approve'), handler)
 *
 * Permission codes mirror the seeded `permissions.code` values (e.g.
 * 'withdrawal.approve', 'kyc.review').
 */
export function authorize(...required: string[]) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();

      const { roles, permissions } = await authService.getUserPermissions(
        req.user.id,
      );
      req.user.roles = roles;
      req.user.permissions = permissions;

      const missing = required.filter((p) => !permissions.includes(p));
      if (missing.length > 0) {
        throw new ForbiddenError(
          'You do not have permission to perform this action',
          'FORBIDDEN',
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
