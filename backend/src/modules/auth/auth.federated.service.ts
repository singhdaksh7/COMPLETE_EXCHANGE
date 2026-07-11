import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { authRepository } from './auth.repository';
import { authService, toPublicUser } from './auth.service';
import {
  firebaseIdentityVerifier,
  type VerifiedFederatedIdentity,
} from '../../lib/federated-identity-verifier';
import {
  authRedisDel,
  authRedisGet,
  authRedisGetDel,
  authRedisSet,
} from '../../lib/redis';
import { config } from '../../config';
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
} from '../../lib/errors';
import { generateOpaqueToken, sha256 } from '../../lib/tokens';
import { generateOtpCode, hashOtp, verifyOtp } from '../../lib/otp';
import { mailer } from '../../lib/mailer';
import { securityService } from '../user-security/user-security.service';
import { legalService } from '../legal/legal.service';
import { REQUIRED_SIGNUP_POLICIES } from '../legal/legal.consent';
import { recordAudit, AuditAction } from '../../lib/audit';
import { logger } from '../../lib/logger';
import type {
  AuthContext,
  FederatedLinkConfirmInput,
  FederatedLoginInput,
  FederatedLoginOutcome,
  FederatedRegisterCompleteInput,
  LoginResult,
} from './auth.types';

// Redis key namespaces — mirrors the existing Google-OAuth state/exchange
// pattern in auth.service.ts (short-lived, hashed, single-use via GETDEL).
const CHALLENGE_KEY = (h: string): string => `auth:federated:challenge:${h}`;
const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes — purpose-bound, single-use.
const LINK_OTP_KEY = (challengeHash: string): string => `auth:federated:link-otp:${challengeHash}`;
const LINK_OTP_TTL_MS = 10 * 60 * 1000;
const LINK_OTP_MAX_ATTEMPTS = 5;

const ARGON_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

type ChallengePayload =
  | {
      purpose: 'LINK_EXISTING';
      provider: 'GOOGLE' | 'APPLE';
      firebaseUid: string;
      providerSubject: string;
      email: string;
      existingUserId: string;
    }
  | {
      purpose: 'REGISTER_NEW';
      provider: 'GOOGLE' | 'APPLE';
      firebaseUid: string;
      providerSubject: string;
      email: string;
    };

interface StoredLinkOtp {
  hash: string;
  attempts: number;
  /** Absolute expiry (epoch ms) — fixed at issuance, never extended by a
   * failed-attempt rewrite (see confirmLink). */
  expiresAt: number;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

async function issueChallenge(payload: ChallengePayload): Promise<string> {
  const token = generateOpaqueToken();
  await authRedisSet(CHALLENGE_KEY(sha256(token)), JSON.stringify(payload), 'PX', CHALLENGE_TTL_MS);
  return token;
}

function parseChallenge(raw: string): ChallengePayload | null {
  try {
    return JSON.parse(raw) as ChallengePayload;
  } catch {
    return null;
  }
}

/**
 * Redeem a challenge for a SPECIFIC expected purpose. Single-use (GETDEL) —
 * but only once the purpose actually matches. A wrong-endpoint attempt
 * (e.g. a LINK_EXISTING token submitted to the REGISTER_NEW endpoint) is
 * rejected WITHOUT consuming the token, so a client bug or a probing request
 * can never burn an otherwise-valid, still-pending challenge for its
 * legitimate endpoint.
 */
async function consumeChallenge<P extends ChallengePayload['purpose']>(
  token: string,
  expectedPurpose: P,
): Promise<Extract<ChallengePayload, { purpose: P }> | null> {
  const key = CHALLENGE_KEY(sha256(token));
  const raw = await authRedisGet(key);
  if (!raw) return null;
  const payload = parseChallenge(raw);
  if (!payload || payload.purpose !== expectedPurpose) return null;

  // Only NOW consume it — this is the correct endpoint for this challenge.
  const stillThere = await authRedisGetDel(key);
  if (!stillThere) return null; // raced with a concurrent redemption
  return payload as Extract<ChallengePayload, { purpose: P }>;
}

/**
 * Federated identity login/linking/onboarding (Stage 12).
 *
 * Firebase Authentication is a verification layer ONLY: this service verifies
 * the Firebase ID token, then applies EXORA's own account-status / location /
 * 2FA / single-session rules and issues EXORA's own AuthSession + tokens —
 * exactly as the password and email-OTP login paths do. It never trusts a
 * client-asserted email/provider/uid; those are always re-derived from the
 * verified token.
 */
export const authFederatedService = {
  /**
   * Entry point: POST /auth/federated/firebase. Verifies the Firebase ID
   * token and resolves to one of AUTHENTICATED / ACCOUNT_LINK_REQUIRED /
   * FEDERATED_REGISTRATION_REQUIRED. Throws (LOCATION_REQUIRED, disabled,
   * provider-unavailable, etc.) exactly like the other login entrypoints.
   */
  async login(input: FederatedLoginInput): Promise<FederatedLoginOutcome> {
    const ctx: AuthContext = {
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      location: input.location,
    };

    if (!config.federatedAuth.enabled) {
      throw new ForbiddenError('Federated sign-in is not enabled', 'FEDERATED_AUTH_DISABLED');
    }

    let verified: VerifiedFederatedIdentity;
    try {
      verified = await firebaseIdentityVerifier.verifyIdToken(input.idToken);
    } catch (err) {
      await recordAudit({
        actorType: 'SYSTEM',
        action: AuditAction.FEDERATED_LOGIN_FAILED,
        entityType: 'federated_identity',
        ip: input.ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
        metadata: {
          provider: input.provider,
          reason: err instanceof AppError ? err.errorCode : 'token_verification_failed',
        },
      });
      if (err instanceof AppError) throw err;
      throw new UnauthorizedError('Invalid or expired federated credential', 'FEDERATED_TOKEN_INVALID');
    }

    if (verified.provider !== input.provider) {
      await this.auditFail(input, 'provider_mismatch');
      throw new ForbiddenError(
        'The verified identity provider does not match the requested provider',
        'FEDERATED_PROVIDER_MISMATCH',
      );
    }
    if (!verified.email || !verified.emailVerified) {
      await this.auditFail(input, 'email_unverified');
      throw new ForbiddenError('Your account email is not verified', 'FEDERATED_EMAIL_UNVERIFIED');
    }

    // 1) Already linked (this Stage's own table) → returning user.
    const linked = await authRepository.findFederatedIdentityWithUser(verified.provider, verified.subject);
    if (linked) {
      const result = await this.authenticateExistingUser(linked.user, ctx);
      await authRepository.touchFederatedIdentityLastLogin(linked.id).catch(() => undefined);
      return { status: 'AUTHENTICATED', result };
    }

    // 2) Backward compatibility: legacy direct-OAuth Google users (the
    //    pre-Stage-12 `OAuthAccount` table, web-only, provider = "google")
    //    keep resolving on login. On a match, lazily migrate them onto the
    //    Firebase-based table too so subsequent logins hit case (1) directly.
    if (verified.provider === 'GOOGLE') {
      const legacy = await authRepository.findOAuthAccountWithUser('google', verified.subject);
      if (legacy) {
        const result = await this.authenticateExistingUser(legacy.user, ctx);
        const migrated = await authRepository
          .linkFederatedIdentity({
            userId: legacy.user.id,
            provider: 'GOOGLE',
            providerSubject: verified.subject,
            firebaseUid: verified.uid,
            emailAtLink: verified.email,
          })
          .catch(() => undefined);
        // Distinct, explicit audit trail for the legacy→Firebase migration
        // (separate from the generic FEDERATED_LOGIN_SUCCEEDED that
        // authenticateExistingUser already recorded above) — best-effort,
        // never fails an otherwise-successful login. Skipped if a concurrent
        // login already created the row (unique-constraint catch above).
        if (migrated) {
          await recordAudit({
            actorType: 'USER',
            actorId: legacy.user.id,
            action: AuditAction.FEDERATED_IDENTITY_LINKED,
            entityType: 'user',
            entityId: legacy.user.id,
            ip: input.ip,
            userAgent: input.userAgent,
            requestId: input.requestId,
            metadata: { provider: 'GOOGLE', reason: 'legacy_oauth_migration' },
          }).catch(() => undefined);
        }
        return { status: 'AUTHENTICATED', result };
      }
    }

    // 3) No federated link at all. A verified-email match against an existing
    //    EXORA account is NEVER auto-linked (security-sensitive — Phase 10) —
    //    the user must prove control of the existing account first.
    const existing = await authRepository.findUserByEmail(verified.email);
    if (existing) {
      const challengeToken = await issueChallenge({
        purpose: 'LINK_EXISTING',
        provider: verified.provider,
        firebaseUid: verified.uid,
        providerSubject: verified.subject,
        email: verified.email,
        existingUserId: existing.id,
      });
      await recordAudit({
        actorType: 'USER',
        actorId: existing.id,
        action: AuditAction.FEDERATED_IDENTITY_LINK_REQUIRED,
        entityType: 'user',
        entityId: existing.id,
        ip: input.ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
        metadata: { provider: verified.provider },
      });
      return {
        status: 'ACCOUNT_LINK_REQUIRED',
        challengeToken,
        maskedEmail: maskEmail(verified.email),
      };
    }

    // 4) Genuinely new identity → registration challenge (phone + policies
    //    collected client-side, no account created yet).
    const challengeToken = await issueChallenge({
      purpose: 'REGISTER_NEW',
      provider: verified.provider,
      firebaseUid: verified.uid,
      providerSubject: verified.subject,
      email: verified.email,
    });
    await recordAudit({
      actorType: 'SYSTEM',
      action: AuditAction.FEDERATED_REGISTRATION_STARTED,
      entityType: 'federated_identity',
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      metadata: { provider: verified.provider },
    });
    return { status: 'FEDERATED_REGISTRATION_REQUIRED', challengeToken, email: verified.email };
  },

  /**
   * Send the email-OTP proof for an ACCOUNT_LINK_REQUIRED challenge. Chosen
   * over password confirmation because federated-only / OTP-only accounts
   * carry an unusable random password hash (see resolveGoogleUser /
   * authOtpService) — email OTP works uniformly for every account shape.
   */
  async requestLinkOtp(challengeToken: string): Promise<void> {
    const payload = await this.peekChallenge(challengeToken, 'LINK_EXISTING');
    const code = generateOtpCode();
    const stored: StoredLinkOtp = {
      hash: hashOtp(payload.email, code),
      attempts: 0,
      expiresAt: Date.now() + LINK_OTP_TTL_MS,
    };
    await authRedisSet(
      LINK_OTP_KEY(sha256(challengeToken)),
      JSON.stringify(stored),
      'PX',
      LINK_OTP_TTL_MS,
    );
    await mailer.sendEmailOtp(payload.email, code, 'LINK_ACCOUNT');
  },

  /** Confirm an ACCOUNT_LINK_REQUIRED challenge with the emailed OTP. */
  async confirmLink(input: FederatedLinkConfirmInput): Promise<FederatedLoginOutcome> {
    const payload = await consumeChallenge(input.challengeToken, 'LINK_EXISTING');
    if (!payload) {
      throw new UnauthorizedError('Invalid or expired link request', 'FEDERATED_CHALLENGE_INVALID');
    }

    const otpKey = LINK_OTP_KEY(sha256(input.challengeToken));
    const rawOtp = await authRedisGet(otpKey);
    if (!rawOtp) {
      throw new UnauthorizedError('Invalid or expired code', 'OTP_INVALID');
    }
    const stored = JSON.parse(rawOtp) as StoredLinkOtp;
    // Belt-and-braces expiry check: the Redis key's own TTL already expires
    // it, but a failed-attempt rewrite (below) must never extend the
    // guessing window past the ORIGINAL deadline — so expiry is also
    // enforced from the fixed `expiresAt` recorded at issuance.
    if (Date.now() >= stored.expiresAt) {
      await authRedisDel(otpKey);
      throw new UnauthorizedError('Invalid or expired code', 'OTP_INVALID');
    }
    if (stored.attempts >= LINK_OTP_MAX_ATTEMPTS) {
      await authRedisDel(otpKey);
      throw new ForbiddenError('Too many incorrect attempts. Start over.', 'OTP_LOCKED');
    }
    if (!verifyOtp(payload.email, input.otp, stored.hash)) {
      const remainingTtlMs = Math.max(1, stored.expiresAt - Date.now());
      await authRedisSet(
        otpKey,
        JSON.stringify({ ...stored, attempts: stored.attempts + 1 }),
        'PX',
        remainingTtlMs,
      );
      throw new UnauthorizedError('Invalid or expired code', 'OTP_INVALID');
    }
    await authRedisDel(otpKey);

    const user = await authRepository.findUserById(payload.existingUserId);
    if (!user) throw new UnauthorizedError('Account not found', 'FEDERATED_CHALLENGE_INVALID');

    await authRepository.linkFederatedIdentity({
      userId: user.id,
      provider: payload.provider,
      providerSubject: payload.providerSubject,
      firebaseUid: payload.firebaseUid,
      emailAtLink: payload.email,
    });
    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.FEDERATED_IDENTITY_LINKED,
      entityType: 'user',
      entityId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      metadata: { provider: payload.provider },
    });

    const ctx: AuthContext = {
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      location: input.location,
    };
    const result = await this.authenticateExistingUser(user, ctx);
    return { status: 'AUTHENTICATED', result };
  },

  /** Complete a FEDERATED_REGISTRATION_REQUIRED challenge: phone + policies. */
  async completeRegistration(
    input: FederatedRegisterCompleteInput,
  ): Promise<FederatedLoginOutcome> {
    const payload = await consumeChallenge(input.challengeToken, 'REGISTER_NEW');
    if (!payload) {
      throw new UnauthorizedError('Invalid or expired registration request', 'FEDERATED_CHALLENGE_INVALID');
    }

    const unusablePassword = await hash(randomBytes(32).toString('hex'), ARGON_OPTS);
    const user = await authRepository.createUserWithFederatedIdentity({
      email: payload.email,
      phone: input.phone,
      passwordHash: unusablePassword,
      provider: payload.provider,
      providerSubject: payload.providerSubject,
      firebaseUid: payload.firebaseUid,
    });
    // The challenge was only issued after `login()`'s `!verified.emailVerified`
    // check already passed, so this new account's email is already
    // server-proven verified — never re-derived from client input.
    await authRepository.setEmailVerified(user.id);

    const ctx: AuthContext = {
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    };
    for (const documentType of REQUIRED_SIGNUP_POLICIES) {
      try {
        await legalService.accept(user.id, { documentType }, ctx);
      } catch (err) {
        // Never orphan an already-created account over a legal-store hiccup —
        // mirrors the same tolerance as password registration (the consent
        // banner re-prompts on next login).
        logger.error(
          { err, userId: user.id, documentType },
          'federated registration: consent recording failed; account created, consent will be re-prompted',
        );
      }
    }

    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.FEDERATED_USER_REGISTERED,
      entityType: 'user',
      entityId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      metadata: { provider: payload.provider },
    });

    const loginLocation = authService.enforceAndCaptureLoginLocation(input.location);
    const tokens = await authService.issueSession(user, {
      ip: input.ip,
      userAgent: input.userAgent,
      location: loginLocation,
    });
    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.FEDERATED_LOGIN_SUCCEEDED,
      entityType: 'user',
      entityId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      metadata: { provider: payload.provider, method: 'federated_registration' },
    });

    return { status: 'AUTHENTICATED', result: { user: toPublicUser(user), tokens } };
  },

  /**
   * Shared tail for an already-resolved user (linked federated identity or
   * legacy OAuthAccount migration): account-status checks, location gate,
   * 2FA challenge (if enabled), session issuance — same guarantees as
   * password/OTP login, never bypassed for a federated sign-in.
   */
  async authenticateExistingUser(user: User, ctx: AuthContext): Promise<LoginResult> {
    if (user.deletedAt) {
      throw new ForbiddenError('Account is disabled. Contact support.', 'ACCOUNT_DISABLED');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_NOT_ACTIVE');
    }

    // Every caller of this method is downstream of `login()`'s own
    // `!verified.emailVerified` rejection (thrown before a LINK_EXISTING
    // challenge is ever issued or a linked identity is looked up), so a
    // server-verified Firebase email claim is already guaranteed here — never
    // trust a client-supplied boolean, only this already-proven fact.
    if (!user.emailVerifiedAt) {
      await authRepository.setEmailVerified(user.id);
    }

    const loginLocation = authService.enforceAndCaptureLoginLocation(ctx.location);

    if (user.totpEnabled) {
      const challengeToken = await securityService.issueLoginChallenge(user.id);
      await recordAudit({
        actorType: 'USER',
        actorId: user.id,
        action: AuditAction.TWO_FA_LOGIN_REQUIRED,
        entityType: 'user',
        entityId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      return { twoFactorRequired: true, challengeToken, methods: ['totp', 'backup_code'] };
    }

    const tokens = await authService.issueSession(user, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      location: loginLocation,
    });
    await recordAudit({
      actorType: 'USER',
      actorId: user.id,
      action: AuditAction.FEDERATED_LOGIN_SUCCEEDED,
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { method: 'federated' },
    });
    return { user: toPublicUser(user), tokens };
  },

  async auditFail(input: FederatedLoginInput, reason: string): Promise<void> {
    await recordAudit({
      actorType: 'SYSTEM',
      action: AuditAction.FEDERATED_LOGIN_FAILED,
      entityType: 'federated_identity',
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      metadata: { provider: input.provider, reason },
    });
  },

  /** Peek (without consuming) a still-pending LINK_EXISTING challenge. */
  async peekChallenge(
    challengeToken: string,
    purpose: 'LINK_EXISTING',
  ): Promise<Extract<ChallengePayload, { purpose: 'LINK_EXISTING' }>> {
    const raw = await authRedisGet(CHALLENGE_KEY(sha256(challengeToken)));
    if (!raw) throw new UnauthorizedError('Invalid or expired link request', 'FEDERATED_CHALLENGE_INVALID');
    const payload = JSON.parse(raw) as ChallengePayload;
    if (payload.purpose !== purpose) {
      throw new UnauthorizedError('Invalid or expired link request', 'FEDERATED_CHALLENGE_INVALID');
    }
    return payload;
  },
};

export type AuthFederatedService = typeof authFederatedService;
