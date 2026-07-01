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
  // Per-user operational feature controls (User Control Center).
  { code: 'users.controls.view', description: 'View a user\'s per-account feature controls' },
  { code: 'users.controls.update', description: 'Enable / disable a user\'s per-account feature controls' },
  { code: 'users.security.manage', description: 'Reset / disable a user\'s 2FA (never exposes secrets)' },
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
  // Tax / TDS + legal acceptance (Stage 5.5).
  { code: 'tax.rule.view', description: 'View tax/TDS rules' },
  { code: 'tax.rule.manage', description: 'Manage tax/TDS rules' },
  { code: 'tax.tds.view', description: 'View TDS calculation records' },
  { code: 'tax.statement.view', description: 'View tax statements' },
  { code: 'tax.statement.generate', description: 'Generate a tax statement (calculation-only)' },
  { code: 'legal.document.view', description: 'View legal document versions' },
  { code: 'legal.document.manage', description: 'Publish legal document versions' },
  { code: 'legal.acceptance.view', description: 'View user legal acceptance records' },
  // FIU draft reporting (Stage 5.6).
  { code: 'compliance.fiuReport.view', description: 'View FIU draft reports' },
  { code: 'compliance.fiuReport.generate', description: 'Generate an FIU draft report' },
  { code: 'compliance.fiuReport.validate', description: 'Validate an FIU draft report' },
  { code: 'compliance.fiuReport.export', description: 'Export an FIU draft report (internal, not submitted)' },
  { code: 'compliance.fiuReport.manage', description: 'Change FIU draft report status' },
  // AML policy engine + compliance-officer workspace (Stage 5.7).
  { code: 'compliance.amlPolicy.view', description: 'View AML policies and rules' },
  { code: 'compliance.amlPolicy.manage', description: 'Create / edit AML policies and rules' },
  { code: 'compliance.amlPolicy.activate', description: 'Activate an AML policy version' },
  { code: 'compliance.workspace.view', description: 'View the compliance officer workspace' },
  { code: 'compliance.task.view', description: 'View compliance tasks' },
  { code: 'compliance.task.manage', description: 'Create / update compliance tasks' },
  { code: 'compliance.task.assign', description: 'Assign compliance tasks' },
  { code: 'compliance.checklist.view', description: 'View AML review checklists' },
  { code: 'compliance.checklist.manage', description: 'Create checklist templates / save responses' },
  { code: 'compliance.approval.view', description: 'View maker-checker approval requests' },
  { code: 'compliance.approval.create', description: 'Create a maker-checker approval request' },
  { code: 'compliance.approval.decide', description: 'Approve / reject a maker-checker request' },
  { code: 'compliance.sla.view', description: 'View compliance SLA tracking' },
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
  // Admin lifecycle + accountability (Stage 7A). deactivate/reactivate are
  // SUPER_ADMIN-only (granted to no other role); the *.view codes are read-only
  // accountability views granted to COMPLIANCE_OFFICER as well.
  { code: 'admins.view', description: 'View the admin management list and profiles' },
  { code: 'admins.security.view', description: 'View an admin security + accountability profile' },
  { code: 'admins.activity.view', description: 'View an admin activity timeline' },
  { code: 'admins.deactivate', description: 'Deactivate (remove access from) an admin' },
  { code: 'admins.reactivate', description: 'Reactivate a previously deactivated admin' },
  { code: 'audit.view', description: 'Read audit & admin logs' },
  { code: 'operations.view', description: 'View the admin operations dashboard' },
  // Internal support / operations tickets (Stage 8C).
  { code: 'support.view', description: 'View support tickets' },
  { code: 'support.manage', description: 'Create / update / assign / close support tickets and add notes' },
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

/**
 * These admin-accountability view permissions are sensitive: they expose other
 * admins' security profiles and full action history. They must NOT be swept
 * into the blanket VIEW_ONLY grant (SUPPORT / READ_ONLY); they are granted
 * explicitly to COMPLIANCE_OFFICER (and to SUPER_ADMIN by role bypass) only.
 */
const SENSITIVE_ADMIN_VIEW = new Set<string>([
  'admins.view',
  'admins.security.view',
  'admins.activity.view',
]);

const VIEW_ONLY = ADMIN_PERMISSIONS.filter(
  (p) => p.code.endsWith('.view') && !SENSITIVE_ADMIN_VIEW.has(p.code),
).map((p) => p.code);

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
      'users.controls.view',
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
      // Tax/TDS (Stage 5.5): FINANCE views rules + TDS, views/generates statements
      // (calculation-only). Rule.manage stays SUPER_ADMIN-only.
      'tax.rule.view',
      'tax.tds.view',
      'tax.statement.view',
      'tax.statement.generate',
      // AML workspace (Stage 5.7): FINANCE gets read-only dashboard + SLA oversight,
      // no AML policy management.
      'compliance.workspace.view',
      'compliance.sla.view',
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
      // Legal (Stage 5.5): compliance reviewer reads documents + acceptances.
      'legal.document.view',
      'legal.acceptance.view',
      // FIU draft reporting (Stage 5.6): view / generate / validate / export.
      'compliance.fiuReport.view',
      'compliance.fiuReport.generate',
      'compliance.fiuReport.validate',
      'compliance.fiuReport.export',
      'compliance.fiuReport.manage',
      // AML workspace (Stage 5.7): compliance officer handles tasks/checklists and
      // is the MAKER for approvals. Policy activate + approval decide stay
      // SUPER_ADMIN-only (the senior/checker role) for maker-checker separation.
      'compliance.amlPolicy.view',
      'compliance.workspace.view',
      'compliance.task.view',
      'compliance.task.manage',
      'compliance.task.assign',
      'compliance.checklist.view',
      'compliance.checklist.manage',
      'compliance.approval.view',
      'compliance.approval.create',
      'compliance.sla.view',
      'user.view',
      'users.view',
      'users.controls.view',
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
  // ---------------------------------------------------------------------------
  // Additional canonical roles surfaced by the Admin Management UI. They are
  // upserted on a clean DB so the "add admin" role dropdown is never empty.
  // ---------------------------------------------------------------------------
  {
    name: 'COMPLIANCE_OFFICER',
    description: 'Compliance review + per-user control management',
    permissions: [
      'users.view',
      'users.controls.view',
      // The compliance officer is the role trusted to gate a user's operational
      // features (trading / INR / crypto / risk) from the User Control Center.
      'users.controls.update',
      // Reset a user's 2FA when they are locked out (audited; no secret exposure).
      'users.security.manage',
      'risk.manage',
      'kyc.view',
      'kyc.review',
      'compliance.view',
      'compliance.review',
      'compliance.export',
      'compliance.screening.view',
      'compliance.screening.run',
      'compliance.screening.review',
      'compliance.case.view',
      'compliance.case.manage',
      'compliance.case.assign',
      'compliance.alert.view',
      'compliance.alert.manage',
      'compliance.monitoring.run',
      'compliance.walletRisk.view',
      'compliance.travelRule.view',
      'compliance.evidencePack.view',
      'compliance.retention.view',
      'compliance.fiuReport.view',
      'compliance.amlPolicy.view',
      'compliance.workspace.view',
      'compliance.task.view',
      'compliance.task.manage',
      'compliance.approval.view',
      'compliance.approval.create',
      'compliance.sla.view',
      'operations.view',
      'system.view',
      'system.risk.view',
      // Admin accountability (Stage 7A): read-only. The compliance officer can
      // review who did what, but cannot deactivate/reactivate admins.
      'admins.view',
      'admins.security.view',
      'admins.activity.view',
    ],
  },
  {
    name: 'INR_OPERATOR',
    description: 'INR deposit / payout operations',
    permissions: [
      'inr.view',
      'inr.approve',
      'deposit.view',
      'withdrawal.view',
      'withdrawals.view',
      'treasury.view',
      'reports.view',
      'ledger.view',
      'users.view',
      'users.controls.view',
      'operations.view',
      'system.view',
    ],
  },
  {
    name: 'SUPPORT_ADMIN',
    description: 'Read-only support across modules + support ticket management',
    // VIEW_ONLY already includes support.view; support.manage is the one write
    // grant that lets this role own the internal support-ticket workflow.
    permissions: [...VIEW_ONLY, 'support.manage'],
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
