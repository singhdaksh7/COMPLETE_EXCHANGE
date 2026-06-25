import { config } from '../../config';

/**
 * Stage 9E — Security / Abuse guardrails STATUS surface.
 *
 * Read-only summary of which protective controls are ENFORCED today vs. PLANNED
 * (documented but not yet wired, usually because the data model does not yet
 * support them safely). It reflects real configuration (rate limits, lockout
 * windows, dual-approval thresholds, TOTP/IP posture) — never secrets.
 *
 * This module changes no behavior; it only describes it. Actual enforcement
 * lives in the auth/withdrawal/admin middleware and services.
 */

export type GuardrailState = 'enforced' | 'partial' | 'planned';

export interface GuardrailItem {
  key: string;
  label: string;
  state: GuardrailState;
  /** Safe, secrets-free description of what is (or will be) enforced. */
  detail: string;
}

export interface GuardrailsReport {
  enforcedCount: number;
  plannedCount: number;
  totalCount: number;
  guardrails: GuardrailItem[];
  environment: string;
  timestamp: string;
}

export const guardrailsService = {
  status(): GuardrailsReport {
    const lockoutMin = Math.round(config.loginLockout.windowMs / 60_000);
    const addressCooldownEnabled = config.withdrawal.addressCooldownMs > 0;
    const adminTotpRequired = !config.security.allowAdminLoginWithoutTotp;

    const guardrails: GuardrailItem[] = [
      {
        key: 'auth_rate_limit',
        label: 'Auth endpoint rate limiting',
        state: 'enforced',
        detail: `Login / OTP / password-reset throttled to ${config.rateLimit.authMax} requests per ${Math.round(
          config.rateLimit.windowMs / 1000,
        )}s (Redis-backed, shared across instances).`,
      },
      {
        key: 'admin_sensitive_rate_limit',
        label: 'Sensitive admin-action rate limiting',
        state: 'enforced',
        detail:
          'Admin login (auth bucket) plus sensitive admin mutations — user lock/unlock, withdrawal block, and withdrawal approve/reject — are rate limited in a dedicated admin-sensitive bucket.',
      },
      {
        key: 'login_lockout',
        label: 'Account lockout on repeated failed logins',
        state: 'enforced',
        detail: `User accounts lock after ${config.loginLockout.maxAttempts} failed attempts within a ${lockoutMin} min rolling window (email + IP).`,
      },
      {
        key: 'admin_totp',
        label: 'Admin two-factor (TOTP) required',
        state: adminTotpRequired ? 'enforced' : 'partial',
        detail: adminTotpRequired
          ? 'Admin login requires a TOTP second factor.'
          : 'TOTP is currently waivable via the staging override (ALLOW_ADMIN_LOGIN_WITHOUT_TOTP).',
      },
      {
        key: 'admin_ip_allowlist',
        label: 'Per-admin IP allowlist',
        state: 'enforced',
        detail:
          'When configured for an admin, the allowlist is enforced at login and on every admin API request.',
      },
      {
        key: 'withdrawal_dual_approval',
        label: 'Withdrawal dual approval (maker-checker)',
        state: 'enforced',
        detail: `Withdrawals at/above ${config.withdrawal.dualApprovalThreshold} USDT require a second, different approver.`,
      },
      {
        key: 'withdrawal_address_cooldown',
        label: 'New withdrawal address cooldown',
        state: addressCooldownEnabled ? 'enforced' : 'partial',
        detail: addressCooldownEnabled
          ? `New withdrawal addresses cannot be used for ${Math.round(
              config.withdrawal.addressCooldownMs / 3_600_000,
            )}h after being added.`
          : 'Address cooldown is available but currently set to 0 (immediate use). Set WITHDRAWAL_ADDRESS_COOLDOWN_MS > 0 to enforce.',
      },
      {
        key: 'new_device_login_alert',
        label: 'New-device login detection',
        state: 'enforced',
        detail: 'Logins from a new device are detected and audited (Stage 3D).',
      },
      {
        key: 'withdrawal_lock_after_security_change',
        label: 'Withdrawal lock after password reset / email change',
        state: 'planned',
        detail:
          'Planned: temporarily block withdrawals for a cool-off window after a credential change. Requires a per-user security-change timestamp not yet modeled.',
      },
      {
        key: 'high_value_withdrawal_review',
        label: 'High-value withdrawal manual review flag',
        state: 'planned',
        detail:
          'Partially covered today: large pending withdrawals surface in System risk alerts and Stage 5.2 monitoring raises high-value alerts. A dedicated hold-for-review flag on the withdrawal model is planned.',
      },
      {
        key: 'admin_failed_login_autolock',
        label: 'Auto-lock on repeated failed admin logins',
        state: 'planned',
        detail:
          'Planned: lock an admin account after repeated failed logins. Admin password failures are not yet recorded against the admin id, so safe enforcement is deferred.',
      },
    ];

    const enforcedCount = guardrails.filter((g) => g.state === 'enforced').length;
    const plannedCount = guardrails.filter((g) => g.state === 'planned').length;

    return {
      enforcedCount,
      plannedCount,
      totalCount: guardrails.length,
      guardrails,
      environment: config.env,
      timestamp: new Date().toISOString(),
    };
  },
};

export type GuardrailsService = typeof guardrailsService;
