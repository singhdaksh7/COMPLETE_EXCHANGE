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

export type AdminLoginDto = z.infer<typeof adminLoginSchema>;
