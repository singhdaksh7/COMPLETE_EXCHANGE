import type { Admin, AdminRole, Permission, Role } from '@prisma/client';

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
  /**
   * True when the admin holds the SUPER_ADMIN role. Such admins bypass every
   * permission check on the backend (see admin-authorize middleware), so the
   * frontend treats this flag as "may see all admin modules". When set, the
   * `permissions` array above is expanded to the full known permission set so a
   * permission-aware UI never hides a module from a master admin — even if the
   * DB grants for SUPER_ADMIN have gone stale relative to newer modules.
   */
  isSuperAdmin: boolean;
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

/** Admin row for the management list UI. */
export interface AdminListItem {
  id: string;
  email: string;
  status: string;
  totpEnabled: boolean;
  roles: string[];
  ipAllowlist: string[];
  ipRestricted: boolean;
  createdAt: Date;
}

/** Result of creating a sub-admin: the one-time initial password is returned
 *  in the response body ONCE and is never logged. */
export interface CreatedAdmin {
  admin: PublicAdmin;
  role: string;
  initialPassword: string;
}

/** Secret material for a self TOTP (re-)enrollment. */
export interface TotpEnrollment {
  secret: string; // base32 secret to enter into the authenticator app
  otpauthUri: string; // otpauth://… URI for QR rendering
}

export function toAdminListItem(
  admin: Admin & { roles: (AdminRole & { role: Role })[] },
): AdminListItem {
  return {
    id: admin.id,
    email: admin.email,
    status: admin.status,
    totpEnabled: admin.totpEnabled,
    roles: admin.roles.map((r) => r.role.name),
    ipAllowlist: admin.ipAllowlist,
    ipRestricted: admin.ipAllowlist.length > 0,
    createdAt: admin.createdAt,
  };
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
