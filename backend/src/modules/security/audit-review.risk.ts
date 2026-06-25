/**
 * Stage 9D — risk classification for admin actions.
 *
 * AdminLog has no stored risk column, so we derive a coarse risk bucket from the
 * action code by prefix. The SAME prefix lists drive both the DB-level risk
 * filter (audit-review.repository) and the per-row display label
 * (audit-review.service), so filtering and labelling never disagree.
 *
 * Classification is intentionally conservative: financial, account-state, and
 * access-control changes are HIGH; review/decision actions are MEDIUM; reads and
 * routine events are LOW.
 */
export type AuditRiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/** Actions that change money, account state, or access control. */
export const HIGH_RISK_PREFIXES: readonly string[] = [
  'withdrawal',
  'admin.login_blocked',
  'admin.create',
  'admin.manage',
  'admin.status',
  'admin.totp',
  'admin.ip',
  'role.',
  'permission.',
  'user.freeze',
  'user.unfreeze',
  'user.lock',
  'user.unlock',
  'user.close',
  'user.status',
  'risk.',
  'withdrawalsBlocked',
  'compliance.screening.override',
  'compliance.risk',
];

/** Review / decision / approval actions that need accountability but are not direct money moves. */
export const MEDIUM_RISK_PREFIXES: readonly string[] = [
  'kyc.',
  'inr.',
  'deposit.',
  'compliance.',
  'session.revoke',
  'auth.session_revoked',
  'user.controls',
  'support.',
  'feature.',
  'legal.',
  'tax.',
];

function matchesAny(action: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => action.startsWith(p));
}

export function classifyRisk(action: string): AuditRiskLevel {
  if (matchesAny(action, HIGH_RISK_PREFIXES)) return 'HIGH';
  if (matchesAny(action, MEDIUM_RISK_PREFIXES)) return 'MEDIUM';
  return 'LOW';
}
