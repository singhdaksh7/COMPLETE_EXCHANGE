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
  INVALID_REFRESH: 'auth.invalid_refresh',
  TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',
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
