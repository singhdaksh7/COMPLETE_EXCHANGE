import { verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../lib/errors';
import { encryptPII, decryptPII } from '../../lib/encryption';
import {
  generateTotpSecret,
  normalizeBase32,
  otpauthUri,
  verifyTotp,
} from '../../lib/totp';
import { generateOpaqueToken, sha256 } from '../../lib/tokens';
import {
  authRedisCall,
  authRedisGet,
  authRedisGetDel,
  authRedisSet,
} from '../../lib/redis';
import { recordAudit, AuditAction } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { securityRepository } from './user-security.repository';
import type { AuthContext } from '../auth/auth.types';

const ISSUER = 'EXORA';
const BACKUP_CODE_COUNT = 10;
const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000; // short-lived, single-purpose
const STEP_UP_TTL_MS = 5 * 60 * 1000; // 5-minute step-up window
const SECOND_FACTOR_MAX_FAILS = 5; // per user, per rolling window
const SECOND_FACTOR_WINDOW_MS = 15 * 60 * 1000;

// Redis namespaces.
const CHALLENGE_KEY = (h: string): string => `auth:2fa:challenge:${h}`;
const STEPUP_KEY = (h: string): string => `auth:stepup:${h}`;
const SECOND_FACTOR_FAIL_KEY = (userId: string): string => `2fa:fail:${userId}`;

export interface TwoFaStatus {
  enabled: boolean;
  /** Number of unused backup codes remaining (0 when 2FA is disabled). */
  backupCodesRemaining: number;
}

export interface TwoFaSetupResult {
  secret: string; // base32 — shown ONCE during setup
  otpauthUri: string; // QR payload — shown ONCE during setup
}

export interface TwoFaConfirmResult {
  enabled: true;
  backupCodes: string[]; // plaintext — shown ONCE, only hashes are stored
}

export interface StepUpResult {
  stepUpToken: string;
  expiresInSeconds: number;
}

/** Seal a base32 secret with the shared AES-256-GCM PII helper. */
function sealSecret(base32: string): Buffer {
  return encryptPII(base32);
}

/** Open a sealed TOTP secret. Returns '' when absent/undecryptable. */
function openSecret(secretEnc: Buffer | null): string {
  if (!secretEnc || secretEnc.length === 0) return '';
  try {
    return normalizeBase32(decryptPII(Buffer.from(secretEnc)));
  } catch {
    return '';
  }
}

/** Generate human-friendly backup codes (e.g. "K7M2P-Q9R4T"). */
function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(10);
    let raw = '';
    for (const b of bytes) raw += alphabet[b % alphabet.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Normalize a backup code for hashing (strip separators, upper-case). */
function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function hashBackupCode(code: string): string {
  return sha256(normalizeBackupCode(code));
}

export const securityService = {
  // ------------------------------------------------------------------
  // Status
  // ------------------------------------------------------------------
  async status(userId: string): Promise<TwoFaStatus> {
    const user = await securityRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    const backupCodesRemaining = user.totpEnabled
      ? await securityRepository.countUnusedRecoveryCodes(userId)
      : 0;
    return { enabled: user.totpEnabled, backupCodesRemaining };
  },

  // ------------------------------------------------------------------
  // Enrollment
  // ------------------------------------------------------------------
  /** Begin enrollment: generate + seal a secret (NOT enabled yet). */
  async setup(userId: string, ctx: AuthContext = {}): Promise<TwoFaSetupResult> {
    const user = await securityRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.totpEnabled) {
      throw new ConflictError('2FA is already enabled', 'TWO_FA_ALREADY_ENABLED');
    }
    const secret = generateTotpSecret();
    await securityRepository.setTotpSecret(userId, sealSecret(secret));
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.TWO_FA_SETUP_STARTED,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return {
      secret,
      otpauthUri: otpauthUri({ secret, accountName: user.email, issuer: ISSUER }),
    };
  },

  /** Confirm enrollment with a valid TOTP code → enable 2FA + issue backup codes. */
  async confirm(
    userId: string,
    code: string,
    ctx: AuthContext = {},
  ): Promise<TwoFaConfirmResult> {
    const user = await securityRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.totpEnabled) {
      throw new ConflictError('2FA is already enabled', 'TWO_FA_ALREADY_ENABLED');
    }
    const secret = openSecret(user.totpSecretEnc);
    if (!secret) {
      throw new BadRequestError('Start 2FA setup before confirming', {
        code: 'TWO_FA_SETUP_REQUIRED',
      });
    }
    if (!verifyTotp(secret, code)) {
      throw new UnauthorizedError('Invalid 2FA code', 'INVALID_TOTP');
    }
    await securityRepository.enableTotp(userId);
    const backupCodes = generateBackupCodes();
    await securityRepository.replaceRecoveryCodes(
      userId,
      backupCodes.map(hashBackupCode),
    );
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.TWO_FA_ENABLED,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { enabled: true, backupCodes };
  },

  /** Disable 2FA — requires BOTH the account password AND a current TOTP/backup code. */
  async disable(
    userId: string,
    password: string,
    code: string,
    ctx: AuthContext = {},
  ): Promise<void> {
    const user = await securityRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (!user.totpEnabled) {
      throw new ConflictError('2FA is not enabled', 'TWO_FA_NOT_ENABLED');
    }
    const passwordOk = await verify(user.passwordHash, password).catch(() => false);
    const secondFactor = passwordOk
      ? await this.verifySecondFactor(userId, code)
      : { ok: false as const, method: undefined };
    if (!passwordOk || !secondFactor.ok) {
      await recordAudit({
        actorType: 'USER',
        actorId: userId,
        action: AuditAction.TWO_FA_DISABLE_FAILED,
        entityType: 'user',
        entityId: userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: { reason: !passwordOk ? 'bad_password' : 'bad_second_factor' },
      });
      throw new UnauthorizedError(
        'Password and a current 2FA code are required to disable 2FA',
        'TWO_FA_DISABLE_REJECTED',
      );
    }
    await securityRepository.disableTotp(userId);
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.TWO_FA_DISABLED,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },

  /** Regenerate backup codes — requires a current TOTP/backup code (2FA must be on). */
  async regenerateBackupCodes(
    userId: string,
    code: string,
    ctx: AuthContext = {},
  ): Promise<{ backupCodes: string[] }> {
    const user = await securityRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (!user.totpEnabled) {
      throw new ConflictError('2FA is not enabled', 'TWO_FA_NOT_ENABLED');
    }
    const secondFactor = await this.verifySecondFactor(userId, code);
    if (!secondFactor.ok) {
      throw new UnauthorizedError('A current 2FA code is required', 'INVALID_TOTP');
    }
    const backupCodes = generateBackupCodes();
    await securityRepository.replaceRecoveryCodes(
      userId,
      backupCodes.map(hashBackupCode),
    );
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.BACKUP_CODES_REGENERATED,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { backupCodes };
  },

  // ------------------------------------------------------------------
  // Second-factor verification (shared by login + step-up)
  // ------------------------------------------------------------------
  /**
   * Verify a presented code as EITHER a current TOTP code OR a one-time backup
   * code. A used backup code is consumed atomically (cannot be reused). Failed
   * attempts are rate-limited per user to blunt brute force.
   */
  async verifySecondFactor(
    userId: string,
    code: string,
  ): Promise<{ ok: boolean; method?: 'totp' | 'backup_code' }> {
    await this.assertSecondFactorNotLocked(userId);
    const user = await securityRepository.findUserById(userId);
    if (!user || !user.totpEnabled) return { ok: false };

    const secret = openSecret(user.totpSecretEnc);
    if (secret && verifyTotp(secret, code)) {
      await this.clearSecondFactorFailures(userId);
      return { ok: true, method: 'totp' };
    }

    // Fall back to a one-time backup code (only when it looks like one).
    const normalized = normalizeBackupCode(code);
    if (normalized.length >= 8) {
      const consumed = await securityRepository.consumeRecoveryCode(
        userId,
        sha256(normalized),
      );
      if (consumed) {
        await this.clearSecondFactorFailures(userId);
        await recordAudit({
          actorType: 'USER',
          actorId: userId,
          action: AuditAction.BACKUP_CODE_USED,
          entityType: 'user',
          entityId: userId,
        });
        return { ok: true, method: 'backup_code' };
      }
    }

    await this.recordSecondFactorFailure(userId);
    return { ok: false };
  },

  async assertSecondFactorNotLocked(userId: string): Promise<void> {
    const raw = await authRedisGet(SECOND_FACTOR_FAIL_KEY(userId)).catch(() => null);
    if (raw && Number(raw) >= SECOND_FACTOR_MAX_FAILS) {
      throw new TooManyRequestsError(
        'Too many 2FA attempts. Please try again later.',
        'TWO_FA_LOCKED',
      );
    }
  },

  async recordSecondFactorFailure(userId: string): Promise<void> {
    const key = SECOND_FACTOR_FAIL_KEY(userId);
    const count = await authRedisCall<number>('INCR', key).catch(() => 0);
    if (count === 1) {
      await authRedisCall('PEXPIRE', key, String(SECOND_FACTOR_WINDOW_MS)).catch(
        () => undefined,
      );
    }
  },

  async clearSecondFactorFailures(userId: string): Promise<void> {
    await authRedisCall('DEL', SECOND_FACTOR_FAIL_KEY(userId)).catch(() => undefined);
  },

  // ------------------------------------------------------------------
  // Login 2FA challenge (issued by auth.service when password is valid)
  // ------------------------------------------------------------------
  /** Mint a short-lived, single-purpose challenge token bound to the user. */
  async issueLoginChallenge(userId: string): Promise<string> {
    const token = generateOpaqueToken();
    await authRedisSet(
      CHALLENGE_KEY(sha256(token)),
      userId,
      'PX',
      LOGIN_CHALLENGE_TTL_MS,
    );
    return token;
  },

  /** Redeem a login challenge token (single-use) → the bound user id, or null. */
  async consumeLoginChallenge(token: string): Promise<string | null> {
    if (!token) return null;
    return authRedisGetDel(CHALLENGE_KEY(sha256(token))).catch(() => null);
  },

  // ------------------------------------------------------------------
  // Step-up authentication
  // ------------------------------------------------------------------
  /**
   * Verify a fresh factor and issue a short-lived step-up token. If the user has
   * 2FA enabled a TOTP/backup code is required; otherwise the account password
   * is required (password re-authentication fallback).
   */
  async stepUp(
    userId: string,
    input: { password?: string; code?: string },
    ctx: AuthContext = {},
  ): Promise<StepUpResult> {
    const user = await securityRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');

    let ok = false;
    let method: string;
    if (user.totpEnabled) {
      method = 'second_factor';
      const result = await this.verifySecondFactor(userId, input.code ?? '');
      ok = result.ok;
    } else {
      method = 'password';
      ok = await verify(user.passwordHash, input.password ?? '').catch(() => false);
    }

    if (!ok) {
      await recordAudit({
        actorType: 'USER',
        actorId: userId,
        action: AuditAction.STEP_UP_FAILED,
        entityType: 'user',
        entityId: userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: { method },
      });
      throw new UnauthorizedError(
        user.totpEnabled
          ? 'A current 2FA code is required to authorize this action'
          : 'Your password is required to authorize this action',
        'STEP_UP_REJECTED',
      );
    }

    const token = generateOpaqueToken();
    await authRedisSet(STEPUP_KEY(sha256(token)), userId, 'PX', STEP_UP_TTL_MS);
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: AuditAction.STEP_UP_VERIFIED,
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { method },
    });
    return { stepUpToken: token, expiresInSeconds: STEP_UP_TTL_MS / 1000 };
  },

  /**
   * Validate a step-up token for a user (used by the requireStepUp middleware).
   * The token stays valid for its TTL window (not single-use) so a 5-minute
   * step-up session can authorize a short sequence of actions.
   */
  async hasValidStepUp(userId: string, token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const bound = await authRedisGet(STEPUP_KEY(sha256(token))).catch(() => null);
    return bound === userId;
  },

  /** Whether the user currently has 2FA enabled (used to shape step-up prompts). */
  async isTwoFaEnabled(userId: string): Promise<boolean> {
    const user = await securityRepository.findUserById(userId);
    return Boolean(user?.totpEnabled);
  },

  // ------------------------------------------------------------------
  // Admin: reset a user's 2FA (no secret/codes ever exposed)
  // ------------------------------------------------------------------
  /** Force-disable a user's 2FA (admin action). Caller handles authz + audit. */
  async adminResetUser2fa(userId: string): Promise<void> {
    const user = await securityRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    await securityRepository.disableTotp(userId);
    logger.info({ userId }, 'admin reset user 2FA');
  },

  async adminGet2faStatus(userId: string): Promise<TwoFaStatus> {
    return this.status(userId);
  },
};

export type SecurityService = typeof securityService;
