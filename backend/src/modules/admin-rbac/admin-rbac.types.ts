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
  /** Stage 9C — true when a SUPER_ADMIN reset forces a password change before
   *  the console is usable. Surfaced on /auth/me so the UI can gate access. */
  mustChangePassword: boolean;
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
  lastLoginAt: Date | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  deactivationReason: string | null;
  mustChangePassword: boolean;
}

/**
 * Rolled-up counts of an admin's recorded actions (Stage 7A). Derived purely
 * from append-only admin_logs — nothing is synthesised. Used on the admin
 * profile so a super admin can see, at a glance, what an admin has actually
 * done (approvals, rejections, security actions) before deciding to remove
 * their access.
 */
export interface AdminActivitySummary {
  depositsApproved: number;
  depositsRejected: number;
  withdrawalsApproved: number;
  withdrawalsRejected: number;
  withdrawalsMarkedPaid: number;
  kycApproved: number;
  kycRejected: number;
  kycRequestedInfo: number;
  userFeatureChanges: number;
  adminSecurityActions: number;
  blockedLogins: number;
  totalActions: number;
}

/**
 * Full admin security + accountability profile (Stage 7A). Never includes the
 * TOTP seed, recovery codes, password hash or any other secret material.
 */
export interface AdminSecurityProfile {
  id: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  totpEnabled: boolean;
  ipAllowlist: string[];
  ipRestricted: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  createdBy: string | null;
  createdByEmail: string | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  deactivatedByEmail: string | null;
  deactivationReason: string | null;
  mustChangePassword: boolean;
  activitySummary: AdminActivitySummary;
}

/** One entry in the admin activity timeline, normalised from admin_logs. */
export interface AdminActivityItem {
  id: string;
  occurredAt: Date;
  action: string;
  entityType: string | null;
  entityId: string | null;
  affectedUserId: string | null;
  result: string | null;
  reason: string | null;
  requestId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AdminActivityPage {
  items: AdminActivityItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface AdminActivityFilters {
  from?: Date;
  to?: Date;
  action?: string;
  entityType?: string;
  userId?: string;
  page: number;
  limit: number;
}

/** Result of creating a sub-admin: the one-time initial password is returned
 *  in the response body ONCE and is never logged. */
export interface CreatedAdmin {
  admin: PublicAdmin;
  role: string;
  initialPassword: string;
}

/** Result of a SUPER_ADMIN password reset: the one-time temporary password is
 *  returned in the response body ONCE and is NEVER stored in plaintext or
 *  logged. The admin must change it on next login (mustChangePassword=true). */
export interface AdminPasswordReset {
  admin: PublicAdmin;
  temporaryPassword: string;
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
    lastLoginAt: admin.lastLoginAt,
    deactivatedAt: admin.deactivatedAt,
    deactivatedBy: admin.deactivatedBy,
    deactivationReason: admin.deactivationReason,
    mustChangePassword: admin.mustChangePassword,
  };
}

export function toPublicAdmin(admin: Admin): PublicAdmin {
  return {
    id: admin.id,
    email: admin.email,
    status: admin.status,
    totpEnabled: admin.totpEnabled,
    createdAt: admin.createdAt,
    mustChangePassword: admin.mustChangePassword,
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
