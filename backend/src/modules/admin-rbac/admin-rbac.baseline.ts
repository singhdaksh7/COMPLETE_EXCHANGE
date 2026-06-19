import type { PrismaClient } from '@prisma/client';

/**
 * Canonical admin RBAC baseline (Stage 3.4B).
 *
 * The single source of truth for the admin roles and permissions the product
 * relies on. `ensureAdminRbacBaseline` is idempotent (upsert-only) so it is safe
 * to run repeatedly — on a fresh DB, on staging, or after adding a permission.
 *
 * It never deletes or downgrades anything; it only guarantees the listed roles
 * and permissions exist and that each role holds at least its mapped grants.
 */

export interface PermissionDef {
  code: string;
  description: string;
}

export const ADMIN_PERMISSIONS: PermissionDef[] = [
  { code: 'user.view', description: 'View user accounts' },
  { code: 'user.freeze', description: 'Freeze / unfreeze a user' },
  { code: 'user.close', description: 'Close a user account' },
  { code: 'kyc.view', description: 'View KYC submissions' },
  { code: 'kyc.review', description: 'Approve / reject KYC' },
  { code: 'deposit.view', description: 'View crypto/INR deposits' },
  { code: 'withdrawal.view', description: 'View withdrawals' },
  { code: 'withdrawal.approve', description: 'Approve a withdrawal (dual control)' },
  { code: 'withdrawal.reject', description: 'Reject a withdrawal' },
  { code: 'inr.view', description: 'View INR transactions' },
  { code: 'inr.approve', description: 'Approve an INR deposit / payout' },
  { code: 'ledger.view', description: 'Read the ledger' },
  { code: 'recon.run', description: 'Trigger reconciliation runs' },
  { code: 'trade.view', description: 'View trades' },
  { code: 'role.manage', description: 'Manage roles & permissions' },
  { code: 'admin.manage', description: 'Create / suspend / manage admin accounts' },
  { code: 'admin.view', description: 'View admin accounts' },
  { code: 'audit.view', description: 'Read audit & admin logs' },
  { code: 'operations.view', description: 'View the admin operations dashboard' },
];

/** Sentinel: SUPER_ADMIN receives EVERY permission. */
export const ALL = '*' as const;

export interface RoleDef {
  name: string;
  description: string;
  permissions: string[] | typeof ALL;
}

const VIEW_ONLY = ADMIN_PERMISSIONS.filter((p) => p.code.endsWith('.view')).map(
  (p) => p.code,
);

export const ADMIN_ROLES: RoleDef[] = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full administrative access',
    permissions: ALL,
  },
  {
    name: 'FINANCE',
    description: 'Withdrawals, INR, ledger & reconciliation',
    permissions: [
      'inr.view',
      'inr.approve',
      'withdrawal.view',
      'withdrawal.approve',
      'withdrawal.reject',
      'ledger.view',
      'recon.run',
      'deposit.view',
      'operations.view',
    ],
  },
  {
    name: 'KYC_REVIEWER',
    description: 'KYC / AML review',
    permissions: ['kyc.view', 'kyc.review', 'user.view', 'operations.view'],
  },
  {
    name: 'SUPPORT',
    description: 'Read-only support across modules',
    permissions: VIEW_ONLY,
  },
  {
    name: 'READ_ONLY',
    description: 'Read-only / auditor access',
    permissions: VIEW_ONLY,
  },
];

/**
 * Idempotently ensure every baseline permission and role exists and that each
 * role holds at least its mapped permissions. Returns a small summary for logs.
 */
export async function ensureAdminRbacBaseline(
  prisma: PrismaClient,
): Promise<{ permissions: number; roles: string[] }> {
  // 1. Permissions.
  const permByCode = new Map<string, string>(); // code -> id
  for (const p of ADMIN_PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: { code: p.code, description: p.description },
    });
    permByCode.set(p.code, row.id);
  }

  // 2. Roles + grants.
  const roleNames: string[] = [];
  for (const r of ADMIN_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: {
        name: r.name,
        scope: 'ADMIN',
        description: r.description,
        isSystem: true,
      },
    });
    roleNames.push(role.name);

    const codes =
      r.permissions === ALL ? ADMIN_PERMISSIONS.map((p) => p.code) : r.permissions;
    for (const code of codes) {
      const permissionId = permByCode.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  return { permissions: ADMIN_PERMISSIONS.length, roles: roleNames };
}
