import { hash, verify } from '@node-rs/argon2';
import { randomUUID, createHash } from 'node:crypto';
import type { User, AuthSession, Prisma } from '@prisma/client';
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
  AppError,
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
import { featureControlsService } from '../feature-controls/feature-controls.service';
import { securityService } from '../user-security/user-security.service';
import { recordAudit, AuditAction } from '../../lib/audit';
import type {
  AuthResult,
  AuthContext,
  LoginInput,
  LoginLocation,
  LoginResult,
  ActivityEventDto,
  MeResult,
  PublicUser,
  RegisterInput,
  RegisterResult,
  SessionDto,
  StoredLocation,
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

export function toPublicUser(user: User): PublicUser {
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

/**
 * Reduce a raw browser geolocation to a privacy-preserving stored form (Stage
 * 7B): coordinates rounded to 3 decimals (~110 m), accuracy kept as a coarse
 * integer, plus a capture timestamp. Returns null for a missing/invalid
 * payload. We never store precise coordinates and never derive a city/state —
 * this is a consented security signal, not a location service.
 */
function sanitizeLocation(location?: LoginLocation | null): StoredLocation | null {
  if (!location) return null;
  const { latitude, longitude, accuracy } = location;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  const round3 = (n: number): number => Math.round(n * 1000) / 1000;
  return {
    lat: round3(latitude),
    lng: round3(longitude),
    accuracy:
      typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0
        ? Math.round(accuracy)
        : null,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Enforce the Stage 7B login-location requirement. When REQUIRE_LOGIN_LOCATION
 * is on, a login without a valid consented location is refused BEFORE any
 * session (or 2FA challenge) is issued. Default off = no behaviour change.
 */
function ensureLoginLocationIfRequired(
  location?: LoginLocation | null,
): StoredLocation | null {
  const stored = sanitizeLocation(location);
  if (config.auth.requireLoginLocation && !stored) {
    throw new AppError(
      'Location permission is required for account security.',
      400,
      'LOCATION_REQUIRED',
    );
  }
  return stored;
}

/** Pull the stored login location back out of a session's deviceInfo JSON. */
function locationFromDeviceInfo(deviceInfo: unknown): StoredLocation | null {
  if (deviceInfo && typeof deviceInfo === 'object') {
    const loc = (deviceInfo as Record<string, unknown>).location;
    if (loc && typeof loc === 'object') return loc as StoredLocation;
  }
  return null;
}

/** Pull the stored user-agent back out of a session's deviceInfo JSON. */
function userAgentFromDeviceInfo(deviceInfo: unknown): string | null {
  if (deviceInfo && typeof deviceInfo === 'object') {
    const ua = (deviceInfo as Record<string, unknown>).userAgent;
    if (typeof ua === 'string') return ua;
  }
  return null;
}

function toSessionDto(s: AuthSession, currentSessionId?: string): SessionDto {
  return {
    id: s.id,
    ip: s.ip,
    device: s.deviceInfo,
    location: locationFromDeviceInfo(s.deviceInfo),
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
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
      // Bypass-aware: when ALLOW_UNVERIFIED_LOGIN is on, the client must NOT gate
      // the user on verification (they can use the app immediately).
      emailVerificationRequired:
        config.auth.requireEmailVerification && !config.auth.allowUnverifiedLogin,
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
  async login(input: LoginInput): Promise<LoginResult> {
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

    // Email-verification gate. The temporary Stage 13 bypass
    // (ALLOW_UNVERIFIED_LOGIN=true) lets unverified users log in for
    // testing/demo while SES is unapproved — without disabling the verification
    // system itself. Default (bypass off) keeps the original behaviour.
    if (
      config.auth.requireEmailVerification &&
      !config.auth.allowUnverifiedLogin &&
      !user.emailVerifiedAt
    ) {
      throw new ForbiddenError(
        'Email address is not verified',
        'EMAIL_NOT_VERIFIED',
      );
    }

    // Stage 7B: enforce the login-location requirement (when enabled) BEFORE any
    // session OR 2FA challenge is issued, so 2FA accounts are gated too. Returns
    // the reduced-precision location to persist (null when not required/absent).
    const loginLocation = ensureLoginLocationIfRequired(input.location);

    // 2FA gate: if the account has TOTP enabled, do NOT issue a session here.
    // Return a short-lived, single-purpose challenge token; the client must call
    // /auth/2fa/verify with a current TOTP or backup code to receive real tokens.
    if (user.totpEnabled) {
      const challengeToken = await securityService.issueLoginChallenge(user.id);
      await recordAudit({
        actorType: 'USER',
        actorId: user.id,
        action: AuditAction.TWO_FA_LOGIN_REQUIRED,
        entityType: 'user',
        entityId: user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
      });
      return {
        twoFactorRequired: true,
        challengeToken,
        methods: ['totp', 'backup_code'],
      };
    }

    const tokens = await this.issueSession(user, {
      ip: input.ip,
      userAgent: input.userAgent,
      location: loginLocation,
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
      metadata: loginLocation
        ? ({ location: loginLocation } as unknown as Prisma.InputJsonValue)
        : undefined,
    });

    return { user: toPublicUser(user), tokens };
  },

  /**
   * Second step of a 2FA-gated login. Redeems the single-use challenge token,
   * verifies a current TOTP or one-time backup code, and only THEN issues the
   * access/refresh session. A bad code is audited and rejected; a valid one
   * mints real tokens exactly as a normal login would.
   */
  async verify2fa(
    challengeToken: string,
    code: string,
    ctx: AuthContext = {},
  ): Promise<AuthResult> {
    const userId = await securityService.consumeLoginChallenge(challengeToken);
    if (!userId) {
      throw new UnauthorizedError(
        'Invalid or expired 2FA challenge',
        'TWO_FA_CHALLENGE_INVALID',
      );
    }
    const user = await authRepository.findUserById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_NOT_ACTIVE');
    }

    // Stage 7B: the second step issues the real session, so enforce/capture the
    // login location here too (the client re-sends it with the 2FA verify).
    const loginLocation = ensureLoginLocationIfRequired(ctx.location);

    const result = await securityService.verifySecondFactor(userId, code);
    if (!result.ok) {
      await recordAudit({
        actorType: 'USER',
        actorId: userId,
        action: AuditAction.TWO_FA_LOGIN_FAILED,
        entityType: 'user',
        entityId: userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      throw new UnauthorizedError('Invalid 2FA code', 'INVALID_TOTP');
    }

    const tokens = await this.issueSession(user, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      location: loginLocation,
    });
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.TWO_FA_LOGIN_SUCCESS,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { method: result.method },
    });
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.LOGIN,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { method: 'password+2fa' },
    });
    return { user: toPublicUser(user), tokens };
  },

  /**
   * Public wrapper around the Stage 7B login-location gate so alternative login
   * entrypoints (email-OTP) enforce/capture location consistently with password
   * + 2FA login. Throws LOCATION_REQUIRED when the requirement is on and the
   * payload is missing/invalid; otherwise returns the reduced-precision location
   * (or null).
   */
  enforceAndCaptureLoginLocation(
    location?: LoginLocation | null,
  ): StoredLocation | null {
    return ensureLoginLocationIfRequired(location);
  },

  /** Create a new session + token pair for a user. */
  async issueSession(
    user: User,
    meta: { ip?: string; userAgent?: string; location?: StoredLocation | null },
  ): Promise<TokenPair> {
    // Device/login-security signal (Stage 3D). Determine — BEFORE creating the
    // new row — whether this login comes from a device we have not seen for this
    // user. Shared by password + OTP logins (both route through issueSession).
    const [priorSessions, sameDeviceSessions] = await Promise.all([
      authRepository.countSessionsForUser(user.id),
      authRepository.countSessionsForUserDevice(user.id, meta.ip, meta.userAgent),
    ]);
    const isNewDevice = priorSessions > 0 && sameDeviceSessions === 0;

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

    // deviceInfo carries the user-agent (device-recognition) and, when the user
    // consented, the reduced-precision login location (Stage 7B).
    const deviceInfo: Record<string, unknown> = {};
    if (meta.userAgent) deviceInfo.userAgent = meta.userAgent;
    if (meta.location) deviceInfo.location = meta.location;

    await authRepository.createSession({
      // The session row id IS the JWT `sid`, so refresh/revocation can look it
      // up directly from the token claims.
      id: sessionId,
      userId: user.id,
      refreshHash: hashToken(refreshToken),
      familyId,
      ip: meta.ip,
      deviceInfo:
        Object.keys(deviceInfo).length > 0
          ? (deviceInfo as Prisma.InputJsonValue)
          : undefined,
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });

    // Stage 7B — SINGLE ACTIVE SESSION policy. A fresh login revokes every other
    // active session for this user so only the newest remains valid; the old
    // token is rejected on its next request (see the authenticate middleware).
    await this.enforceSingleActiveSession(user.id, sessionId, meta);

    // Login-alert ARCHITECTURE PLACEHOLDER (Stage 3D): a login from a new device
    // is recorded to the audit trail now. A real out-of-band alert email is a
    // future step and is deliberately NOT sent here. Never blocks login.
    if (isNewDevice) {
      await recordAudit({
        actorType: 'USER',
        actorId: user.id,
        action: AuditAction.LOGIN_NEW_DEVICE,
        entityType: 'auth_session',
        entityId: sessionId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: 'unrecognized_device' },
      }).catch(() => undefined);
    }

    return { accessToken, refreshToken };
  },

  /**
   * Stage 7B single active session enforcement. Revokes every active session for
   * the user EXCEPT the just-created one, denylists each with the `NEW_LOGIN`
   * reason (so the middleware can show a clear "opened on another device"
   * message), and records a `USER_PREVIOUS_SESSION_REVOKED` audit event with the
   * old + new session context. Best-effort: never fails the login it follows.
   */
  async enforceSingleActiveSession(
    userId: string,
    newSessionId: string,
    meta: { ip?: string; userAgent?: string; location?: StoredLocation | null },
  ): Promise<void> {
    try {
      const others = await authRepository.findOtherActiveSessions(
        userId,
        newSessionId,
      );
      if (others.length === 0) return;

      await authRepository.revokeAllSessionsForUser(userId, newSessionId);
      await Promise.all(
        others.map((s) =>
          this.markSessionRevoked(s.id, 'NEW_LOGIN').catch(() => undefined),
        ),
      );

      await recordAudit({
        actorType: 'USER',
        actorId: userId,
        action: AuditAction.PREVIOUS_SESSION_REVOKED,
        entityType: 'auth_session',
        entityId: newSessionId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: {
          reason: 'new_login',
          newSession: {
            id: newSessionId,
            ip: meta.ip ?? null,
            userAgent: meta.userAgent ?? null,
            location: meta.location ?? null,
          },
          previousSessions: others.map((s) => ({
            id: s.id,
            ip: s.ip,
            userAgent: userAgentFromDeviceInfo(s.deviceInfo),
            location: locationFromDeviceInfo(s.deviceInfo),
          })),
        } as Prisma.InputJsonValue,
      }).catch(() => undefined);
    } catch {
      // Single-session enforcement must never break an otherwise valid login.
    }
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
    // Effective feature access (per-user controls AND global compliance flags)
    // + the global flag status, so the UI hides disabled modules consistently.
    const { features, globalFeatureStatus } =
      await featureControlsService.getMeFeatures(userId);
    return {
      user: toPublicUser(user),
      roles,
      permissions,
      // Lets the UI show a non-blocking "email verification temporarily
      // disabled for testing" notice (Stage 13). No secrets — just the flag.
      emailVerificationBypass: config.auth.allowUnverifiedLogin,
      features,
      globalFeatureStatus,
    };
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
    // Best-effort "last active" stamp (Stage 3D). Throttled in the repository to
    // ≤1 write/min per session; fire-and-forget so it never delays or fails the
    // authenticated request.
    void authRepository.touchSession(sessionId).catch(() => undefined);
    return toPublicUser(session.user);
  },

  /**
   * Add a session to the Redis revocation denylist so the authenticate
   * middleware rejects its still-valid access token instantly. TTL matches
   * the access-token lifetime — after that the JWT is expired anyway.
   *
   * The stored VALUE is a reason code (default '1'). The Stage 7B single-session
   * policy writes 'NEW_LOGIN' so the middleware can return the specific
   * "opened on another device" message + SESSION_REVOKED_BY_NEW_LOGIN code.
   */
  async markSessionRevoked(sessionId: string, reason = '1'): Promise<void> {
    const accessTtlSec = Math.ceil(ttlToMs(config.jwt.accessTtl) / 1000);
    await authRedisSet(`session:revoked:${sessionId}`, reason, 'EX', accessTtlSec);
  },
};

export type AuthService = typeof authService;
