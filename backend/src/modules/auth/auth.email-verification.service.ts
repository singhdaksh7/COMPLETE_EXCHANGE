import { TooManyRequestsError, UnauthorizedError } from '../../lib/errors';
import { recordAudit, AuditAction } from '../../lib/audit';
import { generateOtpCode, hashOtp, verifyOtp } from '../../lib/otp';
import { mailer } from '../../lib/mailer';
import { config } from '../../config';
import { authRepository } from './auth.repository';
import { emailOtpRepository } from './auth.otp.repository';
import type { AuthContext } from './auth.types';

/**
 * Mandatory email verification for password accounts — OTP-code variant.
 *
 * This is the mobile-friendly counterpart to the existing token-link flow
 * (`authService.persistEmailVerificationToken` / `POST /auth/verify-email`,
 * used by the web `/verify-email` page's "click the link" path, which stays
 * unchanged). A clickable email link cannot drive a native app without deep-
 * linking infrastructure this project doesn't have, so mobile — and, as an
 * alternative on web — requests/confirms a 6-digit code instead. Both paths
 * mark the SAME `User.emailVerifiedAt` field, so they are two front doors to
 * one verified state, never two sources of truth.
 *
 * Reuses the exact same secure primitives as the existing passwordless
 * LOGIN/SIGNUP OTP system (`auth.otp.service.ts`): the `EmailOtp` Prisma
 * table, keyed-HMAC hashing, single-use consumption, attempt caps, resend
 * cooldown, and hourly rate limiting — under its own `EMAIL_VERIFICATION`
 * purpose so it can never collide with a LOGIN code for the same (existing)
 * email (see `auth.otp.repository.ts`).
 */

const GENERIC_INVALID = (): UnauthorizedError =>
  new UnauthorizedError('Invalid or expired code', 'OTP_INVALID');

export interface EmailVerificationRequestResult {
  sent: true;
  alreadyVerified: boolean;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}

export const authEmailVerificationService = {
  /**
   * Issue a fresh EMAIL_VERIFICATION code for `email`. Enumeration-safe: the
   * response shape is identical whether the account exists, is already
   * verified, or doesn't exist — a code is only actually generated/sent when
   * there is a real, unverified account to verify.
   */
  async requestVerification(
    email: string,
    ctx: AuthContext = {},
  ): Promise<EmailVerificationRequestResult> {
    const normalized = email.toLowerCase().trim();
    const expiresInSeconds = Math.floor(config.otp.ttlMs / 1000);
    const resendCooldownSeconds = Math.floor(config.otp.resendCooldownMs / 1000);

    const user = await authRepository.findUserByEmail(normalized);
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      // Unknown/disabled account — say nothing account-specific.
      return { sent: true, alreadyVerified: false, expiresInSeconds, resendCooldownSeconds };
    }
    if (user.emailVerifiedAt) {
      // Idempotent for an already-verified account — no code, no email.
      return { sent: true, alreadyVerified: true, expiresInSeconds, resendCooldownSeconds };
    }

    const latest = await emailOtpRepository.findLatestByEmail(normalized, 'EMAIL_VERIFICATION');
    if (latest) {
      const sinceLastMs = Date.now() - latest.lastSentAt.getTime();
      if (sinceLastMs < config.otp.resendCooldownMs) {
        throw new TooManyRequestsError('Please wait before requesting another code.', 'OTP_COOLDOWN');
      }
    }

    const hourAgo = new Date(Date.now() - 3_600_000);
    const sentLastHour = await emailOtpRepository.countSentSince(normalized, 'EMAIL_VERIFICATION', hourAgo);
    if (sentLastHour >= config.otp.maxPerHour) {
      throw new TooManyRequestsError('Too many codes requested. Please try again later.', 'OTP_RATE_LIMITED');
    }

    await emailOtpRepository.invalidateActiveForEmail(normalized, 'EMAIL_VERIFICATION');

    const code = generateOtpCode();
    const otpHash = hashOtp(normalized, code);
    const expiresAt = new Date(Date.now() + config.otp.ttlMs);
    await emailOtpRepository.create({
      email: normalized,
      otpHash,
      purpose: 'EMAIL_VERIFICATION',
      expiresAt,
      maxAttempts: config.otp.maxAttempts,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await mailer.sendEmailOtp(normalized, code, 'EMAIL_VERIFICATION');

    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.OTP_REQUESTED,
      entityType: 'email_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      // Never logs the code — only the (non-sensitive) purpose + email.
      metadata: { email: normalized, purpose: 'EMAIL_VERIFICATION' },
    });

    return { sent: true, alreadyVerified: false, expiresInSeconds, resendCooldownSeconds };
  },

  /**
   * Verify the code and mark the account's email verified. Does NOT issue a
   * session — the caller (controller) resumes the normal login state machine
   * (status checks → location → 2FA → single-session → tokens) exactly as if
   * the user had just logged in with a password, so verification never grants
   * a shortcut around any other gate.
   */
  async confirmVerification(
    email: string,
    code: string,
    ctx: AuthContext = {},
  ): Promise<{ alreadyVerified: boolean }> {
    const normalized = email.toLowerCase().trim();
    const user = await authRepository.findUserByEmail(normalized);
    if (!user || user.deletedAt) {
      await this.auditFail(normalized, ctx, 'no_such_account');
      throw GENERIC_INVALID();
    }
    if (user.emailVerifiedAt) {
      return { alreadyVerified: true };
    }

    const otp = await emailOtpRepository.findLatestActiveByEmail(normalized, 'EMAIL_VERIFICATION');
    if (!otp) {
      await this.auditFail(normalized, ctx, 'no_active_code');
      throw GENERIC_INVALID();
    }
    if (otp.usedAt) {
      await this.auditFail(normalized, ctx, 'already_used');
      throw GENERIC_INVALID();
    }
    if (otp.expiresAt.getTime() <= Date.now()) {
      await this.auditFail(normalized, ctx, 'expired');
      throw new UnauthorizedError('Invalid or expired code', 'OTP_EXPIRED');
    }
    if (otp.attempts >= otp.maxAttempts) {
      await this.auditLocked(normalized, ctx);
      throw new TooManyRequestsError('Too many incorrect attempts. Request a new code.', 'OTP_LOCKED');
    }

    const matches = verifyOtp(normalized, code, otp.otpHash);
    if (!matches) {
      // Never extend expiry on a failed attempt — only the attempt counter moves.
      const updated = await emailOtpRepository.incrementAttempts(otp.id);
      if (updated.attempts >= updated.maxAttempts) {
        await this.auditLocked(normalized, ctx);
        throw new TooManyRequestsError('Too many incorrect attempts. Request a new code.', 'OTP_LOCKED');
      }
      await this.auditFail(normalized, ctx, 'wrong_code');
      throw GENERIC_INVALID();
    }

    // Correct code — consume it (single use) then mark the account verified.
    await emailOtpRepository.markUsed(otp.id);
    await authRepository.setEmailVerified(user.id);

    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.EMAIL_VERIFIED,
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { method: 'otp' },
    });

    return { alreadyVerified: false };
  },

  async auditFail(email: string, ctx: AuthContext, reason: string): Promise<void> {
    await recordAudit({
      actorType: 'SYSTEM',
      action: AuditAction.OTP_FAILED,
      entityType: 'email_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { email, reason, purpose: 'EMAIL_VERIFICATION' },
    });
  },

  async auditLocked(email: string, ctx: AuthContext): Promise<void> {
    await recordAudit({
      actorType: 'SYSTEM',
      action: AuditAction.OTP_LOCKED,
      entityType: 'email_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { email, purpose: 'EMAIL_VERIFICATION' },
    });
  },
};

export type AuthEmailVerificationService = typeof authEmailVerificationService;
