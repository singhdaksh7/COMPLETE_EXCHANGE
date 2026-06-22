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
  { code: 'users.view', description: 'View user accounts and risk summaries' },
  { code: 'users.manage', description: 'Freeze / unfreeze user accounts' },
  { code: 'risk.manage', description: 'Manage user withdrawal blocks and risk notes' },
  { code: 'kyc.view', description: 'View KYC submissions' },
  { code: 'kyc.review', description: 'Approve / reject / request info on KYC' },
  { code: 'compliance.view', description: 'View compliance dashboard and KYC metrics' },
  // Compliance / FIU-PMLA review (Stage 5.0).
  { code: 'compliance.review', description: 'Approve / reject / request-info on compliance KYC' },
  { code: 'compliance.risk.manage', description: 'Set compliance risk level / score for a user' },
  { code: 'compliance.export', description: 'Export a user compliance evidence summary' },
  // Sanctions / PEP / adverse-media screening (Stage 5.1).
  { code: 'compliance.screening.view', description: 'View sanctions / PEP / adverse-media screening results' },
  { code: 'compliance.screening.run', description: 'Run a screening check for a user' },
  { code: 'compliance.screening.review', description: 'Decide (approve / reject / false-positive) a screening check' },
  { code: 'compliance.screening.override', description: 'Approve KYC despite an unresolved screening hit' },
  // Suspicious-transaction monitoring + STR case workflow (Stage 5.2).
  { code: 'compliance.case.view', description: 'View compliance monitoring cases' },
  { code: 'compliance.case.manage', description: 'Create / update / note / change status of compliance cases' },
  { code: 'compliance.case.assign', description: 'Assign a compliance case to an admin' },
  { code: 'compliance.alert.view', description: 'View suspicious-activity alerts' },
  { code: 'compliance.alert.manage', description: 'Link / change status of suspicious-activity alerts' },
  { code: 'compliance.monitoring.run', description: 'Run the suspicious-transaction monitoring engine' },
  { code: 'compliance.str.export', description: 'Export an STR draft (internal, not filed)' },
  // Wallet risk + Travel Rule foundation (Stage 5.3).
  { code: 'compliance.walletRisk.view', description: 'View wallet-risk checks and profiles' },
  { code: 'compliance.walletRisk.run', description: 'Run a wallet-risk check for an address' },
  { code: 'compliance.walletRisk.review', description: 'Review / override a wallet-risk result' },
  { code: 'compliance.travelRule.view', description: 'View Travel Rule transfer records' },
  { code: 'compliance.travelRule.manage', description: 'Change Travel Rule status (collected / exempted / mock-sent)' },
  { code: 'compliance.travelRule.export', description: 'Export a Travel Rule mock packet (internal, not transmitted)' },
  // Record retention + compliance evidence packs (Stage 5.4).
  { code: 'compliance.evidencePack.view', description: 'View compliance evidence packs' },
  { code: 'compliance.evidencePack.generate', description: 'Generate a compliance evidence pack' },
  { code: 'compliance.evidencePack.export', description: 'Export a compliance evidence pack (internal, not filed)' },
  { code: 'compliance.retention.view', description: 'View record-retention policies and reviews' },
  { code: 'compliance.retention.manage', description: 'Manage retention policies and review status' },
  { code: 'compliance.exportEvent.view', description: 'View compliance export audit events' },
  { code: 'notifications.view', description: 'View notification delivery logs' },
  { code: 'deposit.view', description: 'View crypto/INR deposits' },
  { code: 'withdrawal.view', description: 'View withdrawals' },
  { code: 'withdrawal.approve', description: 'Approve a withdrawal (dual control)' },
  { code: 'withdrawal.reject', description: 'Reject a withdrawal' },
  { code: 'withdrawals.view', description: 'View withdrawal queues and details' },
  { code: 'withdrawals.review', description: 'Review and reject withdrawals' },
  { code: 'withdrawals.approve', description: 'Approve withdrawals with maker-checker controls' },
  { code: 'treasury.view', description: 'View treasury and withdrawal exposure summaries' },
  { code: 'fees.view', description: 'View fee revenue reports and fee settings' },
  { code: 'reports.view', description: 'View admin reporting pages' },
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
  // System / Ops Center (Stage 4.3). All end in `.view`, so SUPPORT/READ_ONLY
  // (the VIEW_ONLY roles) inherit them automatically — safe, read-only data.
  { code: 'system.view', description: 'View the system / ops command center' },
  { code: 'system.health.view', description: 'View API/DB/Redis readiness and version info' },
  { code: 'system.risk.view', description: 'View system risk alerts and operational risk signals' },
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
      'withdrawals.view',
      'withdrawals.review',
      'withdrawals.approve',
      'treasury.view',
      'fees.view',
      'reports.view',
      'ledger.view',
      'recon.run',
      'deposit.view',
      'users.view',
      'risk.manage',
      'compliance.view',
      'compliance.screening.view',
      // Monitoring (Stage 5.2): FINANCE has read-only case + alert visibility.
      'compliance.case.view',
      'compliance.alert.view',
      // Wallet risk + Travel Rule (Stage 5.3): read-only visibility.
      'compliance.walletRisk.view',
      'compliance.travelRule.view',
      // Retention oversight (Stage 5.4): read-only — no broad compliance export.
      'compliance.retention.view',
      'compliance.exportEvent.view',
      'operations.view',
      // Ops oversight: FINANCE acts as the operations admin and sees the full
      // Ops Center including health + risk signals.
      'system.view',
      'system.health.view',
      'system.risk.view',
    ],
  },
  {
    name: 'KYC_REVIEWER',
    description: 'KYC / AML review',
    permissions: [
      'kyc.view',
      'kyc.review',
      'compliance.view',
      // Compliance / FIU review: KYC_REVIEWER can review + export evidence.
      // Risk-level override (compliance.risk.manage) stays SUPER_ADMIN-only.
      'compliance.review',
      'compliance.export',
      // Screening (Stage 5.1): view / run / decide. The approval-block override
      // (compliance.screening.override) stays SUPER_ADMIN-only.
      'compliance.screening.view',
      'compliance.screening.run',
      'compliance.screening.review',
      // Monitoring + STR cases (Stage 5.2): full case/alert handling, run the
      // engine, export STR drafts.
      'compliance.case.view',
      'compliance.case.manage',
      'compliance.case.assign',
      'compliance.alert.view',
      'compliance.alert.manage',
      'compliance.monitoring.run',
      'compliance.str.export',
      // Wallet risk + Travel Rule (Stage 5.3): full handling.
      'compliance.walletRisk.view',
      'compliance.walletRisk.run',
      'compliance.walletRisk.review',
      'compliance.travelRule.view',
      'compliance.travelRule.manage',
      'compliance.travelRule.export',
      // Evidence packs + retention (Stage 5.4): full compliance-reviewer handling.
      'compliance.evidencePack.view',
      'compliance.evidencePack.generate',
      'compliance.evidencePack.export',
      'compliance.retention.view',
      'compliance.retention.manage',
      'compliance.exportEvent.view',
      'user.view',
      'operations.view',
      // Compliance admin: sees the ops center + risk alerts (not health-only).
      'system.view',
      'system.risk.view',
    ],
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
