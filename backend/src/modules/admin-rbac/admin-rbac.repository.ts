import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const adminRbacRepository = {
  findAdminByEmail(email: string) {
    return prisma.admin.findUnique({ where: { email } });
  },

  findAdminById(id: string) {
    return prisma.admin.findUnique({ where: { id } });
  },

  updateAdminPassword(id: string, passwordHash: string) {
    return prisma.admin.update({
      where: { id },
      data: { passwordHash },
    });
  },

  // --- Admin management (Stage 3.4B) ---------------------------------------

  /** List every admin with their role names, ordered newest first. */
  listAdminsWithRoles() {
    return prisma.admin.findMany({
      orderBy: { createdAt: 'desc' },
      include: { roles: { include: { role: true } } },
    });
  },

  createAdmin(data: {
    email: string;
    passwordHash: string;
    status: string;
    ipAllowlist?: string[];
  }) {
    return prisma.admin.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        // Sub-admins start with TOTP disabled so they can log in and self-enroll.
        totpSecretEnc: Buffer.alloc(0),
        totpEnabled: false,
        status: data.status,
        ipAllowlist: data.ipAllowlist ?? [],
      },
    });
  },

  updateAdminStatus(id: string, status: string) {
    return prisma.admin.update({ where: { id }, data: { status } });
  },

  setAdminTotp(id: string, data: { secretEnc: Buffer; enabled: boolean }) {
    return prisma.admin.update({
      where: { id },
      data: { totpSecretEnc: data.secretEnc, totpEnabled: data.enabled },
    });
  },

  setAdminIpAllowlist(id: string, ipAllowlist: string[]) {
    return prisma.admin.update({ where: { id }, data: { ipAllowlist } });
  },

  /** Revoke every live session for an admin (used on suspend / TOTP reset). */
  revokeAllAdminSessions(adminId: string) {
    return prisma.adminSession.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  createAdminSession(data: {
    id: string;
    adminId: string;
    refreshHash: string;
    ip?: string;
    expiresAt: Date;
  }) {
    return prisma.adminSession.create({
      data: {
        id: data.id,
        adminId: data.adminId,
        refreshHash: data.refreshHash,
        ip: data.ip,
        expiresAt: data.expiresAt,
      },
    });
  },

  findAdminSessionWithAdmin(id: string) {
    return prisma.adminSession.findUnique({
      where: { id },
      include: { admin: true },
    });
  },

  revokeAdminSession(id: string) {
    return prisma.adminSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  listRoles() {
    return prisma.role.findMany({
      where: { scope: 'ADMIN' },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  },

  findRoleById(id: string) {
    return prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
  },

  findRoleByName(name: string) {
    return prisma.role.findUnique({ where: { name } });
  },

  createRole(data: { name: string; description?: string }) {
    return prisma.role.create({
      data: {
        name: data.name,
        scope: 'ADMIN',
        description: data.description,
      },
      include: { permissions: { include: { permission: true } } },
    });
  },

  updateRole(id: string, data: { description?: string | null }) {
    return prisma.role.update({
      where: { id },
      data,
      include: { permissions: { include: { permission: true } } },
    });
  },

  deleteRole(id: string) {
    return prisma.role.delete({ where: { id } });
  },

  listPermissions() {
    return prisma.permission.findMany({ orderBy: { code: 'asc' } });
  },

  findPermissionById(id: string) {
    return prisma.permission.findUnique({ where: { id } });
  },

  findPermissionByCode(code: string) {
    return prisma.permission.findUnique({ where: { code } });
  },

  createPermission(data: { code: string; description?: string }) {
    return prisma.permission.create({ data });
  },

  updatePermission(id: string, data: { description?: string | null }) {
    return prisma.permission.update({ where: { id }, data });
  },

  async deletePermission(id: string) {
    await prisma.rolePermission.deleteMany({ where: { permissionId: id } });
    return prisma.permission.delete({ where: { id } });
  },

  assignRoleToAdmin(adminId: string, roleId: string) {
    return prisma.adminRole.upsert({
      where: { adminId_roleId: { adminId, roleId } },
      update: {},
      create: { adminId, roleId },
    });
  },

  removeRoleFromAdmin(adminId: string, roleId: string) {
    return prisma.adminRole.deleteMany({ where: { adminId, roleId } });
  },

  grantPermissionToRole(roleId: string, permissionId: string) {
    return prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  },

  revokePermissionFromRole(roleId: string, permissionId: string) {
    return prisma.rolePermission.deleteMany({ where: { roleId, permissionId } });
  },

  getAdminRolesAndPermissions(
    adminId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    return prisma.adminRole
      .findMany({
        where: { adminId },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      })
      .then((rows) => {
        const roles = rows.map((r) => r.role.name);
        const permissions = new Set<string>();
        for (const row of rows) {
          for (const rp of row.role.permissions) {
            permissions.add(rp.permission.code);
          }
        }
        return { roles, permissions: [...permissions] };
      });
  },

  adminsWithRole(roleName: string) {
    return prisma.adminRole.findMany({
      where: { role: { name: roleName }, admin: { status: 'ACTIVE' } },
      select: { adminId: true },
    });
  },

  countActiveAdminsWithRole(roleName: string): Promise<number> {
    return prisma.adminRole.count({
      where: { role: { name: roleName }, admin: { status: 'ACTIVE' } },
    });
  },

  adminIdsForRole(roleId: string): Promise<string[]> {
    return prisma.adminRole
      .findMany({ where: { roleId }, select: { adminId: true } })
      .then((rows) => rows.map((r) => r.adminId));
  },

  adminIdsForPermission(permissionId: string): Promise<string[]> {
    return prisma.adminRole
      .findMany({
        where: { role: { permissions: { some: { permissionId } } } },
        select: { adminId: true },
        distinct: ['adminId'],
      })
      .then((rows) => rows.map((r) => r.adminId));
  },

  writeAdminLog(data: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    beforeState?: Prisma.InputJsonValue;
    afterState?: Prisma.InputJsonValue;
    ip?: string;
    requestId?: string;
  }) {
    return prisma.adminLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        beforeState: data.beforeState,
        afterState: data.afterState,
        ip: data.ip,
        requestId: data.requestId,
      },
    });
  },
};

export type AdminRbacRepository = typeof adminRbacRepository;
