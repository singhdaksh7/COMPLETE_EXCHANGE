import { hash, verify } from '@node-rs/argon2';
import { randomUUID, createHash } from 'node:crypto';
import type { User, AuthSession } from '@prisma/client';
import { authRepository } from './auth.repository';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import {
  authRedisDel,
  authRedisGet,
  authRedisGetDel,
  authRedisSet,
} from '../../lib/redis';
import { config } from '../../config';
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
  BadRequestError,
  NotFoundError,
} from '../../lib/errors';
import { generateOpaqueToken, sha256 } from '../../lib/tokens';
import {
  buildAuthUrl,
  exchangeCodeForProfile,
  generatePkce,
  type GoogleProfile,
} from '../../lib/google-oauth';
import { mailer } from '../../lib/mailer';
import { logger } from '../../lib/logger';
import { notificationService } from '../notification/notification.service';
import { recordAudit, AuditAction } from '../../lib/audit';
import type {
  AuthResult,
  AuthContext,
  LoginInput,
  ActivityEventDto,
  MeResult,
  PublicUser,
  RegisterInput,
  RegisterResult,
  SessionDto,
  TokenPair,
} from './auth.types';

// argon2id parameters (OWASP-aligned baseline; tune per host).
const ARGON_OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

// Redis key namespaces.
const VERIFY_KEY = (h: string): string => `auth:verify:${h}`;
const RESET_KEY = (h: string): string => `auth:reset:${h}`;
const RBAC_KEY = (userId: string): string => `rbac:perms:${userId}`;
// OAuth: CSRF state→PKCE-verifier, and the one-time post-login exchange code
// (stored hashed). Both short-lived and single-use.
const OAUTH_STATE_KEY = (state: string): string => `auth:oauth:state:${state}`;
const OAUTH_EXCHANGE_KEY = (hash: string): string => `auth:oauth:exchange:${hash}`;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OAUTH_EXCHANGE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const GOOGLE_PROVIDER = 'google';
const LOCKOUT_EMAIL_MULTIPLIER = 3;
const LOCKOUT_IP_MULTIPLIER = 10;

/** Refresh tokens are stored hashed (never in plaintext) — like passwords. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * A real Argon2id hash, computed once with the SAME parameters as live password
 * hashes. When a login targets a non-existent user we still run a full verify
 * against this hash so the request spends the same CPU as a wrong-password
 * login for a real user. This closes the timing side channel that a malformed
 * dummy hash (rejected instantly at parse time) would leave wide open.
 */
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hash(
      'cex.invalid-account.constant-time-compare',
      ARGON_OPTS,
    );
  }
  return dummyHashPromise;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    status: user.status,
    kycStatus: user.kycStatus,
    kycTier: user.kycTier,
    emailVerifiedAt: user.emailVerifiedAt,
    totpEnabled: user.totpEnabled,
    createdAt: user.createdAt,
  };
}

function toSessionDto(s: AuthSession, currentSessionId?: string): SessionDto {
  return {
    id: s.id,
    ip: s.ip,
    device: s.deviceInfo,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    current: s.id === currentSessionId,
  };
}

/** Rough TTL parsing for "30d"/"15m" style strings → ms. */
function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 30 * 24 * 60 * 60 * 1000; // default 30d
  const value = Number(match[1]);
  const unit = match[2];
  const factor =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return value * factor;
}

/**
 * Service layer: all auth business logic and orchestration lives here.
 * It depends on the repository for persistence and the lib helpers for
 * crypto/tokens — never on Express types (keeps it testable in isolation).
 */
export const authService = {
  // ------------------------------------------------------------------
  // Registration & email verification
  // ------------------------------------------------------------------
  async register(
    input: RegisterInput,
    ctx: AuthContext = {},
  ): Promise<RegisterResult> {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      throw new ConflictError('Email already registered', 'EMAIL_TAKEN');
    }

    const passwordHash = await hash(input.password, ARGON_OPTS);
    const user = await authRepository.createUser({
      email: input.email,
      phone: input.phone,
      passwordHash,
    });

    // Do not auto-login: email must be verified first (matches OpenAPI). The
    // raw token leaves only via email; only its hash is stored (Redis + TTL).
    //
    // Persisting the token must succeed (otherwise verification is impossible,
    // so we fail the request bounded). Sending the email is best-effort: a mail
    // provider outage (e.g. SES AccessDenied/misconfig) must NOT surface as a
    // confusing 500 on an account that was already created. We log it and let
    // the user re-trigger delivery via /auth/resend-verification.
    const verificationToken = await this.persistEmailVerificationToken(user);
    try {
      await mailer.sendEmailVerification(user.email, verificationToken);
    } catch (err) {
      logger.error(
        { err, userId: user.id },
        'register: verification email dispatch failed; account created, user can resend',
      );
    }

    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.REGISTER,
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return {
      user: toPublicUser(user),
      emailVerificationRequired: config.auth.requireEmailVerification,
    };
  },

  /**
   * Generate a fresh verification token and persist its hash (Redis + TTL).
   * Returns the raw token so the caller can dispatch it. A failure here is
   * fatal to the operation (verification would be impossible without it).
   */
  async persistEmailVerificationToken(user: User): Promise<string> {
    const token = generateOpaqueToken();
    await authRedisSet(
      VERIFY_KEY(sha256(token)),
      user.id,
      'PX',
      config.auth.emailVerificationTtlMs,
    );
    return token;
  },

  /** Generate + persist (hashed) a verification token and dispatch it. */
  async issueEmailVerification(user: User): Promise<void> {
    const token = await this.persistEmailVerificationToken(user);
    await mailer.sendEmailVerification(user.email, token);
  },

  async verifyEmail(token: string, ctx: AuthContext = {}): Promise<PublicUser> {
    const key = VERIFY_KEY(sha256(token));
    const userId = await authRedisGetDel(key);
    if (!userId) {
      await recordAudit({
        actorType: 'SYSTEM',
        action: AuditAction.EMAIL_VERIFICATION_INVALID,
        entityType: 'auth_token',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      throw new BadRequestError(
        'Invalid or expired verification token',
        undefined,
      );
    }

    await authRepository.setEmailVerified(userId);
    const user = await authRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.EMAIL_VERIFIED,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return toPublicUser(user);
  },

  /** Re-send a verification email. Always succeeds (no account enumeration). */
  async resendVerification(
    email: string,
    ctx: AuthContext = {},
  ): Promise<void> {
    const user = await authRepository.findUserByEmail(email);
    if (user && !user.emailVerifiedAt) {
      await this.issueEmailVerification(user);
      await recordAudit({
        actorType: 'USER',
        actorId: user.id,
        action: AuditAction.EMAIL_VERIFICATION_RESENT,
        entityType: 'user',
        entityId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
    }
  },

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------
  async login(input: LoginInput): Promise<AuthResult> {
    // Brute-force lockout: reject before doing any work if this (email, IP) has
    // exceeded the failed-attempt threshold inside the rolling window. We do
    // NOT record the blocked attempt, so an active attack does not perpetually
    // extend its own lockout against a legitimate owner trying to get back in.
    const since = new Date(Date.now() - config.loginLockout.windowMs);
    const [pairFailures, emailFailures, ipFailures] = await Promise.all([
      authRepository.countRecentFailedAttemptsByEmailIp(
        input.email,
        input.ip,
        since,
      ),
      authRepository.countRecentFailedAttemptsByEmail(input.email, since),
      authRepository.countRecentFailedAttemptsByIp(input.ip, since),
    ]);
    const pairLocked = pairFailures >= config.loginLockout.maxAttempts;
    const emailLocked =
      emailFailures >=
      config.loginLockout.maxAttempts * LOCKOUT_EMAIL_MULTIPLIER;
    const ipLocked =
      ipFailures >= config.loginLockout.maxAttempts * LOCKOUT_IP_MULTIPLIER;
    if (pairLocked || emailLocked || ipLocked) {
      await recordAudit({
        actorType: 'SYSTEM',
        action: AuditAction.LOGIN_LOCKED,
        entityType: 'user',
        entityId: undefined,
        ip: input.ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
        metadata: {
          email: input.email,
          dimensions: { pairLocked, emailLocked, ipLocked },
        },
      });
      throw new TooManyRequestsError(
        'Too many failed login attempts. Please try again later.',
        'ACCOUNT_LOCKED',
      );
    }

    const user = await authRepository.findUserByEmail(input.email);

    // Constant-ish behaviour: always run a real Argon2id verify to avoid user
    // enumeration via timing, even when the user does not exist.
    const ok = user
      ? await verify(user.passwordHash, input.password).catch(() => false)
      : await verify(await getDummyHash(), input.password).catch(() => false);

    await authRepository.recordLoginAttempt({
      userId: user?.id,
      email: input.email,
      ip: input.ip,
      success: Boolean(user && ok),
    });

    if (!user || !ok) {
      await recordAudit({
        actorType: 'SYSTEM',
        actorId: user?.id,
        action: AuditAction.LOGIN_FAILED,
        entityType: user ? 'user' : 'login_identifier',
        entityId: user?.id,
        ip: input.ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
        metadata: { email: input.email },
      });
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_NOT_ACTIVE');
    }

    if (config.auth.requireEmailVerification && !user.emailVerifiedAt) {
      throw new ForbiddenError(
        'Email address is not verified',
        'EMAIL_NOT_VERIFIED',
      );
    }

    const tokens = await this.issueSession(user, {
      ip: input.ip,
      userAgent: input.userAgent,
    });

    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.LOGIN,
      entityType: 'user',
      entityId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });

    return { user: toPublicUser(user), tokens };
  },

  /** Create a new session + token pair for a user. */
  async issueSession(
    user: User,
    meta: { ip?: string; userAgent?: string },
  ): Promise<TokenPair> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refreshTtlMs = ttlToMs(config.jwt.refreshTtl);

    const accessToken = signAccessToken({
      sub: user.id,
      sid: sessionId,
      kycTier: user.kycTier,
    });
    const refreshToken = signRefreshToken({
      sub: user.id,
      sid: sessionId,
      fid: familyId,
    });

    await authRepository.createSession({
      // The session row id IS the JWT `sid`, so refresh/revocation can look it
      // up directly from the token claims.
      id: sessionId,
      userId: user.id,
      refreshHash: hashToken(refreshToken),
      familyId,
      ip: meta.ip,
      deviceInfo: meta.userAgent ? { userAgent: meta.userAgent } : undefined,
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });

    return { accessToken, refreshToken };
  },

  // ------------------------------------------------------------------
  // Google OAuth (Authorization Code + PKCE, one-time code exchange)
  // ------------------------------------------------------------------
  /** Build the Google consent URL; stash state→PKCE-verifier in Redis (single-use). */
  async googleStart(): Promise<{ url: string }> {
    if (!config.google.enabled) {
      throw new ForbiddenError('Google sign-in is not enabled', 'OAUTH_DISABLED');
    }
    const state = generateOpaqueToken();
    const { verifier, challenge } = generatePkce();
    await authRedisSet(OAUTH_STATE_KEY(state), verifier, 'PX', OAUTH_STATE_TTL_MS);
    return { url: buildAuthUrl({ state, codeChallenge: challenge }) };
  },

  /**
   * Handle Google's redirect: validate state (single-use → CSRF safe), exchange
   * the code, strictly verify the id_token, apply linking rules, issue OUR own
   * session, and return a one-time exchange code. Tokens never travel via URL.
   */
  async googleCallback(input: {
    code?: string;
    state?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<string> {
    if (!config.google.enabled) {
      throw new ForbiddenError('Google sign-in is not enabled', 'OAUTH_DISABLED');
    }
    if (!input.code || !input.state) {
      throw new BadRequestError('Missing authorization code or state', undefined);
    }

    const verifier = await authRedisGetDel(OAUTH_STATE_KEY(input.state));
    if (!verifier) {
      throw new UnauthorizedError('Invalid or expired OAuth state', 'OAUTH_STATE_INVALID');
    }

    const profile = await exchangeCodeForProfile({
      code: input.code,
      codeVerifier: verifier,
    });

    const ctx: AuthContext = {
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    };
    const user = await this.resolveGoogleUser(profile, ctx);

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_NOT_ACTIVE');
    }

    const tokens = await this.issueSession(user, {
      ip: input.ip,
      userAgent: input.userAgent,
    });

    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.LOGIN,
      entityType: 'user',
      entityId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      metadata: { method: 'google_oauth' },
    });

    // Hand the issued result back via a hashed, single-use, short-TTL code.
    const code = generateOpaqueToken();
    const payload: AuthResult = { user: toPublicUser(user), tokens };
    await authRedisSet(
      OAUTH_EXCHANGE_KEY(sha256(code)),
      JSON.stringify(payload),
      'PX',
      OAUTH_EXCHANGE_TTL_MS,
    );
    return code;
  },

  /** Apply the approved linking rules and return the resolved/created user. */
  async resolveGoogleUser(profile: GoogleProfile, ctx: AuthContext): Promise<User> {
    // 1) Already linked → returning user.
    const linked = await authRepository.findOAuthAccountWithUser(
      GOOGLE_PROVIDER,
      profile.sub,
    );
    if (linked) return linked.user;

    // Any email-based decision requires Google to have verified the email.
    if (!profile.emailVerified) {
      throw new ForbiddenError(
        'Your Google email is not verified',
        'OAUTH_EMAIL_UNVERIFIED',
      );
    }

    const existing = await authRepository.findUserByEmail(profile.email);
    if (existing) {
      // 3) Email belongs to an UNVERIFIED local account → block (anti-takeover).
      if (!existing.emailVerifiedAt) {
        throw new ConflictError(
          'An account with this email already exists. Please sign in with your password and verify your email first.',
          'OAUTH_LOCAL_ACCOUNT_UNVERIFIED',
        );
      }
      // 2) Verified local account → link and proceed.
      await authRepository.linkOAuthAccount({
        userId: existing.id,
        provider: GOOGLE_PROVIDER,
        providerAccountId: profile.sub,
        email: profile.email,
      });
      await recordAudit({
        actorType: 'USER',
        actorId: existing.id,
        action: AuditAction.LOGIN,
        entityType: 'oauth_account',
        entityId: existing.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: { event: 'oauth_link', provider: GOOGLE_PROVIDER },
      });
      return existing;
    }

    // 4) No local account → create an OAuth-only user with an unusable password
    //    (random argon2 hash) so password login can never succeed for them.
    const unusablePassword = await hash(generateOpaqueToken(), ARGON_OPTS);
    const user = await authRepository.createUserWithOAuth({
      email: profile.email,
      passwordHash: unusablePassword,
      provider: GOOGLE_PROVIDER,
      providerAccountId: profile.sub,
    });
    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.REGISTER,
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { method: 'google_oauth', event: 'oauth_signup' },
    });
    return user;
  },

  /** Redeem a one-time OAuth exchange code for the issued session (single-use). */
  async oauthExchange(code: string): Promise<AuthResult> {
    const stored = await authRedisGetDel(OAUTH_EXCHANGE_KEY(sha256(code)));
    if (!stored) {
      throw new UnauthorizedError('Invalid or expired code', 'OAUTH_CODE_INVALID');
    }
    return JSON.parse(stored) as AuthResult;
  },

  // ------------------------------------------------------------------
  // Refresh-token rotation (with family revocation on reuse)
  // ------------------------------------------------------------------
  /**
   * Rotating refresh: verify the presented refresh token, ensure it matches
   * the stored hash (reuse detection), then issue a fresh pair and update the
   * stored hash. A replayed (already-rotated) token revokes the whole family.
   */
  async refresh(refreshToken: string, ctx: AuthContext = {}): Promise<TokenPair> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      await recordAudit({
        actorType: 'SYSTEM',
        action: AuditAction.INVALID_REFRESH,
        entityType: 'auth_session',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      throw new UnauthorizedError('Invalid refresh token', 'TOKEN_INVALID');
    }

    const session = await authRepository
      .findSessionById(payload.sid)
      .catch(() => null);

    if (!session || session.revokedAt) {
      // Token references a revoked/unknown session → treat as compromise.
      await this.handleReuse(payload.fid, payload.sid, payload.sub, ctx);
      throw new UnauthorizedError('Refresh token rejected', 'TOKEN_REUSE');
    }

    const presentedHash = hashToken(refreshToken);
    if (session.refreshHash !== presentedHash) {
      // A valid-but-stale token was replayed → revoke the family.
      await this.handleReuse(session.familyId, session.id, session.userId, ctx);
      throw new UnauthorizedError('Refresh token reuse detected', 'TOKEN_REUSE');
    }

    const user = await authRepository.findUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_NOT_ACTIVE');
    }

    const refreshTtlMs = ttlToMs(config.jwt.refreshTtl);
    const newAccess = signAccessToken({
      sub: user.id,
      sid: session.id,
      kycTier: user.kycTier,
    });
    const newRefresh = signRefreshToken({
      sub: user.id,
      sid: session.id,
      fid: session.familyId,
    });

    // Atomic compare-and-swap: only the request whose presented hash still
    // matches the stored hash wins the rotation. A concurrent replay of the
    // same token finds the hash already swapped (count === 0) → that is reuse,
    // so we revoke the whole family. This removes the read-then-write race.
    const rotated = await authRepository.rotateSessionAtomic(
      session.id,
      presentedHash,
      hashToken(newRefresh),
      new Date(Date.now() + refreshTtlMs),
    );

    if (rotated === 0) {
      await this.handleReuse(session.familyId, session.id, session.userId, ctx);
      throw new UnauthorizedError('Refresh token reuse detected', 'TOKEN_REUSE');
    }

    return { accessToken: newAccess, refreshToken: newRefresh };
  },

  /** Revoke a compromised family, denylist the session, and audit it. */
  async handleReuse(
    familyId: string,
    sessionId: string,
    userId: string,
    ctx: AuthContext,
  ): Promise<void> {
    await authRepository.revokeFamily(familyId);
    await this.markSessionRevoked(sessionId);
    await recordAudit({
      actorType: 'SYSTEM',
      actorId: userId,
      action: AuditAction.TOKEN_REUSE_DETECTED,
      entityType: 'auth_session_family',
      entityId: familyId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },

  // ------------------------------------------------------------------
  // Logout & session management
  // ------------------------------------------------------------------
  /** Logout: revoke the session in the DB and add it to the Redis denylist. */
  async logout(sessionId: string, ctx: AuthContext = {}): Promise<void> {
    await authRepository.revokeSession(sessionId);
    await this.markSessionRevoked(sessionId);
    await recordAudit({
      actorType: 'USER',
      actorId: undefined,
      action: AuditAction.LOGOUT,
      entityType: 'auth_session',
      entityId: sessionId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },

  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionDto[]> {
    const sessions = await authRepository.findActiveSessionsByUser(userId);
    return sessions.map((s) => toSessionDto(s, currentSessionId));
  },

  /** The caller's recent account/security events (read-only audit feed). */
  async listActivity(
    userId: string,
    limit = 50,
  ): Promise<ActivityEventDto[]> {
    const rows = await authRepository.listUserAuditLogs(userId, limit);
    return rows.map((r) => ({
      id: r.id.toString(),
      action: r.action,
      entityType: r.entityType,
      ip: r.ip,
      metadata: r.metadata,
      occurredAt: r.occurredAt,
    }));
  },

  async revokeSession(
    userId: string,
    sessionId: string,
    ctx: AuthContext = {},
  ): Promise<void> {
    const count = await authRepository.revokeSessionForUser(userId, sessionId);
    if (count === 0) throw new NotFoundError('Session not found');
    await this.markSessionRevoked(sessionId);
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.SESSION_REVOKED,
      entityType: 'auth_session',
      entityId: sessionId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    await notificationService.notify({ userId, type: 'SECURITY_SESSION_REVOKED' });
  },

  // ------------------------------------------------------------------
  // Password: forgot / reset / change
  // ------------------------------------------------------------------
  /** Always succeeds; emits a reset token only if the account exists. */
  async forgotPassword(email: string, ctx: AuthContext = {}): Promise<void> {
    const user = await authRepository.findUserByEmail(email);
    if (!user) return;
    const token = generateOpaqueToken();
    await authRedisSet(
      RESET_KEY(sha256(token)),
      user.id,
      'PX',
      config.auth.passwordResetTtlMs,
    );
    await mailer.sendPasswordReset(user.email, token);
    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },

  async resetPassword(
    token: string,
    newPassword: string,
    ctx: AuthContext = {},
  ): Promise<void> {
    const key = RESET_KEY(sha256(token));
    const userId = await authRedisGetDel(key);
    if (!userId) {
      await recordAudit({
        actorType: 'SYSTEM',
        action: AuditAction.PASSWORD_RESET_INVALID,
        entityType: 'auth_token',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      throw new BadRequestError('Invalid or expired reset token', undefined);
    }

    const passwordHash = await hash(newPassword, ARGON_OPTS);
    await authRepository.updatePassword(userId, passwordHash);

    // Security: a reset invalidates every existing session everywhere.
    await this.revokeAllAndDenylist(userId, undefined, ctx);

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.PASSWORD_RESET,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    await notificationService.notify({ userId, type: 'PASSWORD_CHANGED' });
  },

  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    ctx: AuthContext = {},
  ): Promise<void> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new UnauthorizedError('User not found');

    const ok = await verify(user.passwordHash, currentPassword).catch(
      () => false,
    );
    if (!ok) {
      await recordAudit({
        actorType: 'USER',
        actorId: userId,
        action: AuditAction.PASSWORD_CHANGE_FAILED,
        entityType: 'user',
        entityId: userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      throw new UnauthorizedError(
        'Current password is incorrect',
        'INVALID_CREDENTIALS',
      );
    }

    const passwordHash = await hash(newPassword, ARGON_OPTS);
    await authRepository.updatePassword(userId, passwordHash);

    // Revoke every OTHER session; the caller's current session stays alive.
    await this.revokeAllAndDenylist(userId, currentSessionId, ctx);

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    await notificationService.notify({ userId, type: 'PASSWORD_CHANGED' });
  },

  /** Revoke all (or all-but-one) sessions and denylist each in Redis. */
  async revokeAllAndDenylist(
    userId: string,
    exceptSessionId?: string,
    ctx: AuthContext = {},
  ): Promise<void> {
    const { revokedSessionIds } =
      await authRepository.revokeAllSessionsForUser(userId, exceptSessionId);
    await Promise.all(
      revokedSessionIds.map((id) =>
        this.markSessionRevoked(id).catch(() => undefined),
      ),
    );
    if (revokedSessionIds.length > 0) {
      await recordAudit({
        actorType: 'SYSTEM',
        actorId: userId,
        action: AuditAction.SESSIONS_REVOKED_ALL,
        entityType: 'user',
        entityId: userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: {
          exceptSessionId,
          revokedSessionIds,
        },
      });
    }
  },

  async revokeAllSessionsForSecurityEvent(
    userId: string,
    ctx: AuthContext = {},
  ): Promise<void> {
    await this.revokeAllAndDenylist(userId, undefined, ctx);
  },

  // ------------------------------------------------------------------
  // RBAC
  // ------------------------------------------------------------------
  /** Effective roles + permissions, cached briefly in Redis. */
  async getUserPermissions(
    userId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const cached = await authRedisGet(RBAC_KEY(userId)).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as { roles: string[]; permissions: string[] };
      } catch {
        // fall through and recompute on malformed cache
      }
    }
    const result = await authRepository.getUserRolesAndPermissions(userId);
    await authRedisSet(
        RBAC_KEY(userId),
        JSON.stringify(result),
        'EX',
        config.auth.rbacCacheTtlSec,
      )
      .catch(() => undefined);
    return result;
  },

  /** Drop the RBAC cache for a user (call after a role/permission change). */
  async invalidatePermissions(userId: string): Promise<void> {
    await authRedisDel(RBAC_KEY(userId));
  },

  async invalidatePermissionsAfterRoleChange(userId: string): Promise<void> {
    await this.invalidatePermissions(userId);
  },

  // ------------------------------------------------------------------
  // Profile
  // ------------------------------------------------------------------
  async me(userId: string): Promise<MeResult> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new UnauthorizedError('User not found');
    const { roles, permissions } = await this.getUserPermissions(userId);
    return { user: toPublicUser(user), roles, permissions };
  },

  async validateAccessSession(
    userId: string,
    sessionId: string,
  ): Promise<PublicUser> {
    const session = await authRepository.findSessionWithUserById(sessionId);
    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt
    ) {
      throw new UnauthorizedError('Session is no longer valid', 'SESSION_INVALID');
    }
    return toPublicUser(session.user);
  },

  /**
   * Add a session to the Redis revocation denylist so the authenticate
   * middleware rejects its still-valid access token instantly. TTL matches
   * the access-token lifetime — after that the JWT is expired anyway.
   */
  async markSessionRevoked(sessionId: string): Promise<void> {
    const accessTtlSec = Math.ceil(ttlToMs(config.jwt.accessTtl) / 1000);
    await authRedisSet(`session:revoked:${sessionId}`, '1', 'EX', accessTtlSec);
  },
};

export type AuthService = typeof authService;
