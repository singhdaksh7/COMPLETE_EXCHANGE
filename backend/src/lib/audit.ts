import type { ActorType, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';

/**
 * Append-only audit trail writer (ARCHITECTURE.md §15, frozen `audit_logs`).
 *
 * Records who-did-what for security-relevant actions. The table is append-only
 * (DB trigger rejects UPDATE/DELETE), so we only ever INSERT. Auditing must
 * never break the request it describes: a failure here is logged, not thrown.
 *
 * Distinct from the ledger (which is the *money* truth) — this is the
 * *accountability* truth.
 */
export interface AuditInput {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Prisma.InputJsonValue;
}

/** Stable action codes for auth events (kept together to avoid typos). */
export const AuditAction = {
  REGISTER: 'auth.register',
  EMAIL_VERIFIED: 'auth.email_verified',
  EMAIL_VERIFICATION_INVALID: 'auth.email_verification_invalid',
  EMAIL_VERIFICATION_RESENT: 'auth.email_verification_resent',
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGIN_LOCKED: 'auth.login_locked',
  LOGOUT: 'auth.logout',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET_INVALID: 'auth.password_reset_invalid',
  PASSWORD_RESET: 'auth.password_reset',
  PASSWORD_CHANGED: 'auth.password_changed',
  PASSWORD_CHANGE_FAILED: 'auth.password_change_failed',
  SESSION_REVOKED: 'auth.session_revoked',
  SESSIONS_REVOKED_ALL: 'auth.sessions_revoked_all',
  // Stage 7B — single active session policy. A new login revokes the user's
  // previous session(s); the old token is rejected on its next request.
  PREVIOUS_SESSION_REVOKED: 'auth.previous_session_revoked',
  INVALID_REFRESH: 'auth.invalid_refresh',
  TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',
  // Email OTP (passwordless login/signup, Stage 3A).
  OTP_REQUESTED: 'auth.otp_requested',
  OTP_VERIFIED: 'auth.otp_verified',
  OTP_FAILED: 'auth.otp_failed',
  OTP_LOCKED: 'auth.otp_locked',
  OTP_SIGNUP: 'auth.otp_signup',
  // Session / device security (Stage 3D).
  LOGIN_NEW_DEVICE: 'auth.login_new_device',
  // User 2FA / MFA (TOTP) lifecycle.
  TWO_FA_SETUP_STARTED: 'user.2fa_setup_started',
  TWO_FA_ENABLED: 'user.2fa_enabled',
  TWO_FA_DISABLE_FAILED: 'user.2fa_disable_failed',
  TWO_FA_DISABLED: 'user.2fa_disabled',
  TWO_FA_LOGIN_REQUIRED: 'user.2fa_login_required',
  TWO_FA_LOGIN_SUCCESS: 'user.2fa_login_success',
  TWO_FA_LOGIN_FAILED: 'user.2fa_login_failed',
  BACKUP_CODE_USED: 'user.backup_code_used',
  BACKUP_CODES_REGENERATED: 'user.backup_codes_regenerated',
  // Step-up authentication for sensitive user actions.
  STEP_UP_VERIFIED: 'user.step_up_verified',
  STEP_UP_FAILED: 'user.step_up_failed',
  // Admin-initiated user 2FA management.
  ADMIN_USER_2FA_RESET: 'admin.user_2fa_reset',
  ADMIN_USER_2FA_STATUS_VIEWED: 'admin.user_2fa_status_viewed',
} as const;

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ip: input.ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
        metadata: input.metadata,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'Failed to write audit log');
  }
}
