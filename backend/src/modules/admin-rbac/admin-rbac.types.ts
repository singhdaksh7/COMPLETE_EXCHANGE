import type { Admin, Permission, Role } from '@prisma/client';

export interface AdminContext {
  adminId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface AdminLoginInput extends AdminContext {
  email: string;
  password: string;
  totp: string;
}

export interface AdminTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PublicAdmin {
  id: string;
  email: string;
  status: string;
  totpEnabled: boolean;
  createdAt: Date;
}

export interface AdminProfile {
  admin: PublicAdmin;
  roles: string[];
  permissions: string[];
}

export interface RoleDto {
  id: string;
  name: string;
  scope: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  permissions?: string[];
}

export interface PermissionDto {
  id: string;
  code: string;
  description: string | null;
}

export function toPublicAdmin(admin: Admin): PublicAdmin {
  return {
    id: admin.id,
    email: admin.email,
    status: admin.status,
    totpEnabled: admin.totpEnabled,
    createdAt: admin.createdAt,
  };
}

export function toRoleDto(
  role: Role & { permissions?: { permission: Permission }[] },
): RoleDto {
  return {
    id: role.id,
    name: role.name,
    scope: role.scope,
    description: role.description,
    isSystem: role.isSystem,
    createdAt: role.createdAt,
    permissions: role.permissions?.map((p) => p.permission.code),
  };
}

export function toPermissionDto(permission: Permission): PermissionDto {
  return {
    id: permission.id,
    code: permission.code,
    description: permission.description,
  };
}
