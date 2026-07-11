import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import type { EmailOtpPurpose, User } from '@prisma/client';
import {
  ForbiddenError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../lib/errors';
import { recordAudit, AuditAction } from '../../lib/audit';
import { generateOtpCode, hashOtp, verifyOtp } from '../../lib/otp';
import { mailer } from '../../lib/mailer';
import { config } from '../../config';
import { authRepository } from './auth.repository';
import { emailOtpRepository } from './auth.otp.repository';
import { authService, toPublicUser } from './auth.service';
import type {
  AuthContext,
  OtpRequestResult,
  OtpVerifyResult,
} from './auth.types';

// Same OWASP-aligned argon2id baseline used for real passwords, so an OTP-only
// account's unusable password hash is indistinguishable in cost/shape.
const ARGON_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

// Generic verify failure surfaced to the client. Deliberately uniform so a
// wrong code, an unknown email, and an expired code are indistinguishable.
const GENERIC_INVALID = (): UnauthorizedError =>
  new UnauthorizedError('Invalid or expired code', 'OTP_INVALID');

/**
 * Email-OTP (passwordless) login + signup (Stage 3A).
 *
 * Reuses the existing session machinery (authService.issueSession) and login-
 * attempt / audit logging, so OTP auth produces the SAME session + token shape
 * as password login and never touches the separate admin auth surface.
 */
export const authOtpService = {
  /**
   * Issue a fresh OTP for `email`. Enumeration-safe: the response is identical
   * whether or not an account exists, and a code is always generated + "sent".
   * Throttled by a per-email resend cooldown and an hourly cap (IP rate limiting
   * is applied separately by the route's authRateLimiter).
   */
  async requestOtp(
    email: string,
    ctx: AuthContext = {},
  ): Promise<OtpRequestResult> {
    const normalized = email.toLowerCase().trim();

    // Authoritative purpose: derived from existence, never from the client hint.
    // Determined up front so cooldown/cap/invalidate are scoped to the SAME
    // purpose a LOGIN vs EMAIL_VERIFICATION request would use for this email
    // (both apply to an existing user) — otherwise one purpose's traffic would
    // throttle or invalidate the other's code.
    const user = await authRepository.findUserByEmail(normalized);
    const purpose: EmailOtpPurpose = user ? 'LOGIN' : 'SIGNUP';

    // Resend cooldown: reject if the most recent code was sent too recently.
    const latest = await emailOtpRepository.findLatestByEmail(normalized, purpose);
    if (latest) {
      const sinceLastMs = Date.now() - latest.lastSentAt.getTime();
      if (sinceLastMs < config.otp.resendCooldownMs) {
        throw new TooManyRequestsError(
          'Please wait before requesting another code.',
          'OTP_COOLDOWN',
        );
      }
    }

    // Hourly anti-abuse cap per email.
    const hourAgo = new Date(Date.now() - 3_600_000);
    const sentLastHour = await emailOtpRepository.countSentSince(
      normalized,
      purpose,
      hourAgo,
    );
    if (sentLastHour >= config.otp.maxPerHour) {
      throw new TooManyRequestsError(
        'Too many codes requested. Please try again later.',
        'OTP_RATE_LIMITED',
      );
    }

    // Only one active code at a time (per purpose) — issuing a new one retires the rest.
    await emailOtpRepository.invalidateActiveForEmail(normalized, purpose);

    const code = generateOtpCode();
    const otpHash = hashOtp(normalized, code);
    const expiresAt = new Date(Date.now() + config.otp.ttlMs);
    await emailOtpRepository.create({
      email: normalized,
      otpHash,
      purpose,
      expiresAt,
      maxAttempts: config.otp.maxAttempts,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await mailer.sendEmailOtp(normalized, code, purpose);

    await recordAudit({
      actorType: 'SYSTEM',
      actorId: user?.id,
      action: AuditAction.OTP_REQUESTED,
      entityType: 'email_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      // Never logs the code — only the (non-sensitive) purpose + email.
      metadata: { email: normalized, purpose },
    });

    return {
      sent: true,
      expiresInSeconds: Math.floor(config.otp.ttlMs / 1000),
      resendCooldownSeconds: Math.floor(config.otp.resendCooldownMs / 1000),
    };
  },

  /** Resend is request semantics (cooldown + cap enforced identically). */
  resendOtp(email: string, ctx: AuthContext = {}): Promise<OtpRequestResult> {
    return this.requestOtp(email, ctx);
  },

  /**
   * Verify an OTP and authenticate. On success: an existing account logs in
   * (and is marked email-verified, since the code proves control of the inbox);
   * an unknown email becomes a new passwordless, email-verified account. Either
   * way a normal user session + token pair is issued.
   */
  async verifyOtp(
    email: string,
    code: string,
    ctx: AuthContext = {},
  ): Promise<OtpVerifyResult> {
    const normalized = email.toLowerCase().trim();
    // Stage 7B: enforce the login-location requirement up front so a missing
    // location fails BEFORE the single-use OTP code is consumed.
    const loginLocation = authService.enforceAndCaptureLoginLocation(ctx.location);
    // Same purpose derivation as requestOtp — this call site is LOGIN/SIGNUP
    // only (email verification has its own confirm method in
    // auth.email-verification.service.ts). Looked up once and reused below.
    const existing = await authRepository.findUserByEmail(normalized);
    const purpose: EmailOtpPurpose = existing ? 'LOGIN' : 'SIGNUP';
    const otp = await emailOtpRepository.findLatestActiveByEmail(normalized, purpose);

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
      throw new TooManyRequestsError(
        'Too many incorrect attempts. Request a new code.',
        'OTP_LOCKED',
      );
    }

    const matches = verifyOtp(normalized, code, otp.otpHash);
    if (!matches) {
      const updated = await emailOtpRepository.incrementAttempts(otp.id);
      await authRepository.recordLoginAttempt({
        email: normalized,
        ip: ctx.ip,
        success: false,
      });
      if (updated.attempts >= updated.maxAttempts) {
        await this.auditLocked(normalized, ctx);
        throw new TooManyRequestsError(
          'Too many incorrect attempts. Request a new code.',
          'OTP_LOCKED',
        );
      }
      await this.auditFail(normalized, ctx, 'wrong_code');
      throw GENERIC_INVALID();
    }

    // Correct code — consume it (single use) before issuing anything.
    await emailOtpRepository.markUsed(otp.id);

    let user: User;
    let isNewUser: boolean;

    if (existing) {
      // Stage 9C — archived (soft-deleted) accounts cannot authenticate via OTP.
      if (existing.deletedAt) {
        throw new ForbiddenError('Account is disabled. Contact support.', 'ACCOUNT_DISABLED');
      }
      if (existing.status !== 'ACTIVE') {
        throw new ForbiddenError('Account is not active', 'ACCOUNT_NOT_ACTIVE');
      }
      user = existing;
      isNewUser = false;
      // A successful OTP proves inbox control → mark verified if not already.
      if (!user.emailVerifiedAt) {
        await authRepository.setEmailVerified(user.id);
      }
    } else {
      // Signup: passwordless account with an unusable random password hash so
      // password login can never succeed for it. Email is verified by the OTP.
      const unusablePasswordHash = await hash(
        randomBytes(32).toString('hex'),
        ARGON_OPTS,
      );
      user = await authRepository.createUser({
        email: normalized,
        passwordHash: unusablePasswordHash,
      });
      await authRepository.setEmailVerified(user.id);
      isNewUser = true;
      await recordAudit({
        actorType: 'USER',
        actorId: user.id,
        action: AuditAction.OTP_SIGNUP,
        entityType: 'user',
        entityId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
    }

    await authRepository.recordLoginAttempt({
      userId: user.id,
      email: normalized,
      ip: ctx.ip,
      success: true,
    });

    // Single active session is applied inside issueSession; loginLocation was
    // enforced/captured at the top of this method (before consuming the code).
    const tokens = await authService.issueSession(user, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      location: loginLocation,
    });

    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.OTP_VERIFIED,
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { isNewUser },
    });
    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.LOGIN,
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { method: 'email_otp' },
    });

    return { user: toPublicUser(user), tokens, isNewUser };
  },

  async auditFail(
    email: string,
    ctx: AuthContext,
    reason: string,
  ): Promise<void> {
    await recordAudit({
      actorType: 'SYSTEM',
      action: AuditAction.OTP_FAILED,
      entityType: 'email_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { email, reason },
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
      metadata: { email },
    });
  },
};

export type AuthOtpService = typeof authOtpService;
