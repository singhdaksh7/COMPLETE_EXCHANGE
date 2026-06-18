import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { adminRbacService } from './admin-rbac.service';
import type { AdminContext } from './admin-rbac.types';

function ctx(req: Request): AdminContext {
  return {
    adminId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

export const adminRbacController = {
  async login(req: Request, res: Response): Promise<void> {
    const tokens = await adminRbacService.login({
      email: req.body.email,
      password: req.body.password,
      totp: req.body.totp,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: String(req.id),
    });
    sendSuccess(res, { tokens });
  },

  async me(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const profile = await adminRbacService.profile(req.admin.id, ctx(req));
    sendSuccess(res, profile);
  },

  async listRoles(_req: Request, res: Response): Promise<void> {
    const items = await adminRbacService.listRoles();
    sendSuccess(res, { items });
  },

  async createRole(req: Request, res: Response): Promise<void> {
    const role = await adminRbacService.createRole(req.body, ctx(req));
    sendSuccess(res, { role }, 201);
  },

  async updateRole(req: Request, res: Response): Promise<void> {
    const role = await adminRbacService.updateRole(
      req.params.roleId,
      req.body,
      ctx(req),
    );
    sendSuccess(res, { role });
  },

  async deleteRole(req: Request, res: Response): Promise<void> {
    await adminRbacService.deleteRole(req.params.roleId, ctx(req));
    sendSuccess(res, { deleted: true });
  },

  async listPermissions(_req: Request, res: Response): Promise<void> {
    const items = await adminRbacService.listPermissions();
    sendSuccess(res, { items });
  },

  async createPermission(req: Request, res: Response): Promise<void> {
    const permission = await adminRbacService.createPermission(req.body, ctx(req));
    sendSuccess(res, { permission }, 201);
  },

  async updatePermission(req: Request, res: Response): Promise<void> {
    const permission = await adminRbacService.updatePermission(
      req.params.permissionId,
      req.body,
      ctx(req),
    );
    sendSuccess(res, { permission });
  },

  async deletePermission(req: Request, res: Response): Promise<void> {
    await adminRbacService.deletePermission(req.params.permissionId, ctx(req));
    sendSuccess(res, { deleted: true });
  },

  async assignRoleToAdmin(req: Request, res: Response): Promise<void> {
    await adminRbacService.assignRoleToAdmin(
      req.params.adminId,
      req.params.roleId,
      ctx(req),
    );
    sendSuccess(res, { assigned: true });
  },

  async removeRoleFromAdmin(req: Request, res: Response): Promise<void> {
    await adminRbacService.removeRoleFromAdmin(
      req.params.adminId,
      req.params.roleId,
      ctx(req),
    );
    sendSuccess(res, { removed: true });
  },

  // --- Admin management (Stage 3.4B) ---------------------------------------

  async listAdmins(_req: Request, res: Response): Promise<void> {
    const items = await adminRbacService.listAdmins();
    sendSuccess(res, { items });
  },

  async createAdmin(req: Request, res: Response): Promise<void> {
    const created = await adminRbacService.createAdmin(
      { email: req.body.email, roleId: req.body.roleId, status: req.body.status },
      ctx(req),
    );
    // initialPassword is returned ONCE here and never logged.
    sendSuccess(res, created, 201);
  },

  async setAdminStatus(req: Request, res: Response): Promise<void> {
    const admin = await adminRbacService.updateAdminStatus(
      req.params.adminId,
      req.body.status,
      ctx(req),
    );
    sendSuccess(res, { admin });
  },

  async resetAdminTotp(req: Request, res: Response): Promise<void> {
    const admin = await adminRbacService.resetAdminTotp(req.params.adminId, ctx(req));
    sendSuccess(res, { admin });
  },

  async setIpAllowlist(req: Request, res: Response): Promise<void> {
    const result = await adminRbacService.setIpAllowlist(
      req.params.adminId,
      req.body.ips,
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async enrollTotp(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const enrollment = await adminRbacService.enrollTotp(req.admin.id, ctx(req));
    sendSuccess(res, enrollment);
  },

  async confirmTotp(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const admin = await adminRbacService.confirmTotp(
      req.admin.id,
      req.body.code,
      ctx(req),
    );
    sendSuccess(res, { admin });
  },

  async grantPermissionToRole(req: Request, res: Response): Promise<void> {
    await adminRbacService.grantPermissionToRole(
      req.params.roleId,
      req.params.permissionId,
      ctx(req),
    );
    sendSuccess(res, { granted: true });
  },

  async revokePermissionFromRole(req: Request, res: Response): Promise<void> {
    await adminRbacService.revokePermissionFromRole(
      req.params.roleId,
      req.params.permissionId,
      ctx(req),
    );
    sendSuccess(res, { revoked: true });
  },
};
