import { z } from 'zod';

const uuid = z.string().uuid('Invalid id');
const roleName = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[A-Z0-9_]+$/, 'Role name must be uppercase snake case');
const permissionCode = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9_.:-]+$/, 'Invalid permission code');

export const adminLoginSchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    password: z.string().min(1, 'Password is required'),
    totp: z.string().regex(/^[0-9]{6}$/, 'Invalid TOTP code'),
  })
  .strict();

export const createRoleSchema = z
  .object({
    name: roleName,
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateRoleSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const createPermissionSchema = z
  .object({
    code: permissionCode,
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const updatePermissionSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const adminIdParamSchema = z.object({ adminId: uuid }).strict();
export const roleIdParamSchema = z.object({ roleId: uuid }).strict();
export const permissionIdParamSchema = z.object({ permissionId: uuid }).strict();
export const rolePermissionParamSchema = z
  .object({ roleId: uuid, permissionId: uuid })
  .strict();
export const adminRoleParamSchema = z.object({ adminId: uuid, roleId: uuid }).strict();

// --- Admin management (Stage 3.4B) -----------------------------------------

export const createAdminSchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    roleId: uuid,
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  })
  .strict();

export const adminStatusSchema = z
  .object({ status: z.enum(['ACTIVE', 'SUSPENDED']) })
  .strict();

export const ipAllowlistSchema = z
  .object({
    // Each entry is an IPv4 address or IPv4 CIDR; deeper validation in the
    // service rejects malformed entries. Cap the list to a sane size.
    ips: z.array(z.string().trim().min(1).max(43)).max(50),
  })
  .strict();

export const totpConfirmSchema = z
  .object({ code: z.string().regex(/^[0-9]{6}$/, 'Invalid TOTP code') })
  .strict();

// --- Admin lifecycle (Stage 7A) --------------------------------------------

/** Deactivate an admin: a reason is mandatory for the audit trail. */
export const deactivateAdminSchema = z
  .object({
    reason: z.string().trim().min(3, 'A reason is required').max(500),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Reactivate an admin: a reason is mandatory for the audit trail. */
export const reactivateAdminSchema = z
  .object({
    reason: z.string().trim().min(3, 'A reason is required').max(500),
  })
  .strict();

/** Query filters for the admin activity timeline. */
export const adminActivityQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    action: z.string().trim().min(1).max(120).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    userId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type AdminLoginDto = z.infer<typeof adminLoginSchema>;
export type CreateAdminDto = z.infer<typeof createAdminSchema>;
export type AdminStatusDto = z.infer<typeof adminStatusSchema>;
export type IpAllowlistDto = z.infer<typeof ipAllowlistSchema>;
export type TotpConfirmDto = z.infer<typeof totpConfirmSchema>;
export type DeactivateAdminDto = z.infer<typeof deactivateAdminSchema>;
export type ReactivateAdminDto = z.infer<typeof reactivateAdminSchema>;
export type AdminActivityQueryDto = z.infer<typeof adminActivityQuerySchema>;
