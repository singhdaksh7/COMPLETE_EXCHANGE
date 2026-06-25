import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import { createHash } from 'node:crypto';
import type { User, AuthSession } from '@prisma/client';

// --- mock the IO boundaries; everything else (argon2, jwt, tokens) is real ---
vi.mock('../../src/modules/auth/auth.repository', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn(),
    createSession: vi.fn(),
    findSessionById: vi.fn(),
    findSessionWithUserById: vi.fn(),
    rotateSessionAtomic: vi.fn(),
    revokeSession: vi.fn(),
    revokeFamily: vi.fn(),
    recordLoginAttempt: vi.fn(),
    countRecentFailedAttempts: vi.fn(),
    countRecentFailedAttemptsByEmailIp: vi.fn(),
    countRecentFailedAttemptsByEmail: vi.fn(),
    countRecentFailedAttemptsByIp: vi.fn(),
    setEmailVerified: vi.fn(),
    updatePassword: vi.fn(),
    findActiveSessionsByUser: vi.fn(),
    revokeSessionForUser: vi.fn(),
    revokeAllSessionsForUser: vi.fn(),
    getUserRolesAndPermissions: vi.fn(),
    listUserAuditLogs: vi.fn(),
    countSessionsForUser: vi.fn().mockResolvedValue(0),
    countSessionsForUserDevice: vi.fn().mockResolvedValue(1),
    touchSession: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../src/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    call: vi.fn().mockResolvedValue(null),
  },
  authRedisGet: vi.fn().mockResolvedValue(null),
  authRedisGetDel: vi.fn().mockResolvedValue(null),
  authRedisSet: vi.fn().mockResolvedValue('OK'),
  authRedisDel: vi.fn().mockResolvedValue(1),
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { authService } from '../../src/modules/auth/auth.service';
import { authRepository } from '../../src/modules/auth/auth.repository';
import {
  authRedisDel,
  authRedisGet,
  authRedisGetDel,
  authRedisSet,
  redis,
} from '../../src/lib/redis';
import { mailer } from '../../src/lib/mailer';
import { AuditAction, recordAudit } from '../../src/lib/audit';
import { config } from '../../src/config';

const repo = vi.mocked(authRepository);
const r = vi.mocked(redis);
const authGet = vi.mocked(authRedisGet);
const authGetDel = vi.mocked(authRedisGetDel);
const authSet = vi.mocked(authRedisSet);
const authDel = vi.mocked(authRedisDel);
const audit = vi.mocked(recordAudit);

const sha = (t: string): string => createHash('sha256').update(t).digest('hex');

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    phone: null,
    passwordHash: 'x',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    phoneVerifiedAt: null,
    kycStatus: 'NOT_STARTED',
    kycTier: 0,
    totpSecretEnc: null,
    totpEnabled: false,
    referralCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...over,
  } as User;
}

function makeSession(over: Partial<AuthSession> = {}): AuthSession {
  return {
    id: 'sess-1',
    userId: 'user-1',
    refreshHash: 'hash',
    familyId: 'fam-1',
    deviceInfo: null,
    ip: '127.0.0.1',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    ...over,
  } as AuthSession;
}

const PASSWORD = 'Str0ngPassword';
let pwHash = '';

beforeAll(async () => {
  pwHash = await hash(PASSWORD);
});

beforeEach(() => {
  vi.clearAllMocks();
  r.get.mockResolvedValue(null);
  r.set.mockResolvedValue('OK');
  r.del.mockResolvedValue(1);
  authGet.mockResolvedValue(null);
  authGetDel.mockResolvedValue(null);
  authSet.mockResolvedValue('OK');
  authDel.mockResolvedValue(1);
  repo.countRecentFailedAttemptsByEmailIp.mockResolvedValue(0);
  repo.countRecentFailedAttemptsByEmail.mockResolvedValue(0);
  repo.countRecentFailedAttemptsByIp.mockResolvedValue(0);
  mailer.clearOutbox();
});

describe('register', () => {
  it('creates a user and issues an email-verification token (not auto-login)', async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    repo.createUser.mockResolvedValue(makeUser({ emailVerifiedAt: null }));

    const result = await authService.register({
      email: 'user@example.com',
      password: PASSWORD,
    });

    expect(result.user.email).toBe('user@example.com');
    expect(result).not.toHaveProperty('tokens'); // no session issued at register
    expect(result.emailVerificationRequired).toBe(true);
    // a hashed verify token is stored in Redis and a token was "sent"
    expect(authSet).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:verify:/),
      'user-1',
      'PX',
      expect.any(Number),
    );
    expect(mailer.lastTokenFor('user@example.com', 'EMAIL_VERIFICATION')).toBeTruthy();
  });

  it('rejects a duplicate email', async () => {
    repo.findUserByEmail.mockResolvedValue(makeUser());
    await expect(
      authService.register({ email: 'user@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ errorCode: 'EMAIL_TAKEN', statusCode: 409 });
  });

  it('fails bounded when the verification token store is unavailable', async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    repo.createUser.mockResolvedValue(makeUser({ emailVerifiedAt: null }));
    authSet.mockRejectedValue(new Error('Authentication token store unavailable'));

    await expect(
      authService.register({ email: 'user@example.com', password: PASSWORD }),
    ).rejects.toThrow('Authentication token store unavailable');
  });

  it('still succeeds (no confusing 500) when verification email dispatch fails', async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    repo.createUser.mockResolvedValue(makeUser({ emailVerifiedAt: null }));
    // Simulate a mail-provider outage (e.g. SES AccessDeniedException).
    const sendSpy = vi
      .spyOn(mailer, 'sendEmailVerification')
      .mockRejectedValue(new Error('SES AccessDeniedException'));

    try {
      const result = await authService.register({
        email: 'user@example.com',
        password: PASSWORD,
      });

      // User is created and a clear, verification-required result is returned;
      // the token was still persisted so /auth/resend-verification works.
      expect(result.user.email).toBe('user@example.com');
      expect(result.emailVerificationRequired).toBe(true);
      expect(repo.createUser).toHaveBeenCalledOnce();
      expect(authSet).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:verify:/),
        'user-1',
        'PX',
        expect.any(Number),
      );
      expect(sendSpy).toHaveBeenCalledOnce();
    } finally {
      sendSpy.mockRestore();
    }
  });
});

describe('login', () => {
  it('blocks after the lockout threshold for the email + IP pair', async () => {
    repo.countRecentFailedAttemptsByEmailIp.mockResolvedValue(5);
    await expect(
      authService.login({ email: 'user@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_LOCKED', statusCode: 429 });
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.LOGIN_LOCKED }),
    );
  });

  it('blocks after the global account/email lockout threshold', async () => {
    repo.countRecentFailedAttemptsByEmail.mockResolvedValue(15);
    await expect(
      authService.login({ email: 'user@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_LOCKED', statusCode: 429 });
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
  });

  it('blocks after the IP lockout threshold', async () => {
    repo.countRecentFailedAttemptsByIp.mockResolvedValue(50);
    await expect(
      authService.login({ email: 'user@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_LOCKED', statusCode: 429 });
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
  });

  it('records a failed attempt and rejects invalid credentials (no user)', async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    await expect(
      authService.login({ email: 'nope@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });
    expect(repo.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.LOGIN_FAILED }),
    );
  });

  it('refuses login when the email is unverified (ALLOW_UNVERIFIED_LOGIN=false)', async () => {
    repo.findUserByEmail.mockResolvedValue(
      makeUser({ passwordHash: pwHash, emailVerifiedAt: null }),
    );
    await expect(
      authService.login({ email: 'user@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ errorCode: 'EMAIL_NOT_VERIFIED', statusCode: 403 });
  });

  it('allows an unverified login when ALLOW_UNVERIFIED_LOGIN=true (Stage 13 bypass)', async () => {
    const prev = config.auth.allowUnverifiedLogin;
    config.auth.allowUnverifiedLogin = true;
    try {
      repo.findUserByEmail.mockResolvedValue(
        makeUser({ passwordHash: pwHash, emailVerifiedAt: null }),
      );
      repo.createSession.mockResolvedValue(makeSession());

      const result = await authService.login({
        email: 'user@example.com',
        password: PASSWORD,
      });

      expect(result.tokens.accessToken).toBeTruthy();
      expect(repo.createSession).toHaveBeenCalledOnce();
      expect(repo.recordLoginAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    } finally {
      config.auth.allowUnverifiedLogin = prev;
    }
  });

  it('issues a session on valid, verified login', async () => {
    repo.findUserByEmail.mockResolvedValue(makeUser({ passwordHash: pwHash }));
    repo.createSession.mockResolvedValue(makeSession());

    const result = await authService.login({
      email: 'user@example.com',
      password: PASSWORD,
    });

    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(repo.createSession).toHaveBeenCalledOnce();
    expect(repo.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });
});

describe('refresh rotation', () => {
  // build a real, signed refresh token whose session hash matches it
    async function setupValidRefresh() {
    const { tokens } = await (async () => {
      repo.findUserByEmail.mockResolvedValue(makeUser({ passwordHash: pwHash }));
      repo.createSession.mockResolvedValue(makeSession());
      return authService.login({ email: 'user@example.com', password: PASSWORD });
    })();
    return tokens.refreshToken;
  }

  it('rotates and returns a new pair when the presented hash matches', async () => {
    const refresh = await setupValidRefresh();
    repo.findSessionById.mockResolvedValue(
      makeSession({ refreshHash: sha(refresh) }),
    );
    repo.findUserById.mockResolvedValue(makeUser({ passwordHash: pwHash }));
    repo.rotateSessionAtomic.mockResolvedValue(1);

    const pair = await authService.refresh(refresh);
    expect(pair.refreshToken).toBeTruthy();
    expect(pair.refreshToken).not.toBe(refresh);
    expect(repo.rotateSessionAtomic).toHaveBeenCalledOnce();
  });

  it('revokes the family when a stale token (hash mismatch) is replayed', async () => {
    const refresh = await setupValidRefresh();
    repo.findSessionById.mockResolvedValue(
      makeSession({ refreshHash: 'a-different-hash' }),
    );

    await expect(authService.refresh(refresh)).rejects.toMatchObject({
      errorCode: 'TOKEN_REUSE',
    });
    expect(repo.revokeFamily).toHaveBeenCalledWith('fam-1');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.TOKEN_REUSE_DETECTED }),
    );
  });

  it('revokes the family when the atomic CAS loses (concurrent reuse)', async () => {
    const refresh = await setupValidRefresh();
    repo.findSessionById.mockResolvedValue(
      makeSession({ refreshHash: sha(refresh) }),
    );
    repo.findUserById.mockResolvedValue(makeUser({ passwordHash: pwHash }));
    repo.rotateSessionAtomic.mockResolvedValue(0); // someone else already rotated

    await expect(authService.refresh(refresh)).rejects.toMatchObject({
      errorCode: 'TOKEN_REUSE',
    });
    expect(repo.revokeFamily).toHaveBeenCalledOnce();
  });

  it('audits invalid refresh tokens', async () => {
    await expect(authService.refresh('not-a-jwt')).rejects.toMatchObject({
      errorCode: 'TOKEN_INVALID',
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.INVALID_REFRESH }),
    );
  });
});

describe('email verification', () => {
  it('verifies via a valid token and consumes it', async () => {
    authGetDel.mockResolvedValue('user-1');
    repo.setEmailVerified.mockResolvedValue(1);
    repo.findUserById.mockResolvedValue(makeUser());

    const user = await authService.verifyEmail('rawtoken');
    expect(user.id).toBe('user-1');
    expect(authGetDel).toHaveBeenCalledWith(expect.stringMatching(/^auth:verify:/));
    expect(r.del).not.toHaveBeenCalled();
  });

  it('rejects an invalid/expired token', async () => {
    authGetDel.mockResolvedValue(null);
    await expect(authService.verifyEmail('bad')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMAIL_VERIFICATION_INVALID,
      }),
    );
  });

  it('audits resend verification without revealing account existence', async () => {
    repo.findUserByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));
    await authService.resendVerification('user@example.com');
    expect(authSet).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:verify:/),
      'user-1',
      'PX',
      expect.any(Number),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMAIL_VERIFICATION_RESENT,
      }),
    );
  });
});

describe('password reset & change', () => {
  it('forgot-password emits a reset token only when the account exists', async () => {
    repo.findUserByEmail.mockResolvedValue(makeUser());
    await authService.forgotPassword('user@example.com');
    expect(authSet).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:reset:/),
      'user-1',
      'PX',
      expect.any(Number),
    );

    vi.clearAllMocks();
    repo.findUserByEmail.mockResolvedValue(null);
    await authService.forgotPassword('ghost@example.com');
    expect(authSet).not.toHaveBeenCalled(); // no enumeration signal
  });

  it('resets the password and revokes all sessions', async () => {
    authGetDel.mockResolvedValue('user-1');
    repo.updatePassword.mockResolvedValue(makeUser());
    repo.revokeAllSessionsForUser.mockResolvedValue({
      revokedSessionIds: ['s1', 's2'],
    });

    await authService.resetPassword('rawtoken', 'NewStr0ngPass');
    expect(repo.updatePassword).toHaveBeenCalledOnce();
    expect(repo.revokeAllSessionsForUser).toHaveBeenCalledWith('user-1', undefined);
    expect(authSet).toHaveBeenCalledTimes(2); // denylist s1 + s2
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.SESSIONS_REVOKED_ALL }),
    );
  });

  it('revokes sessions durably even when Redis denylisting fails', async () => {
    repo.revokeAllSessionsForUser.mockResolvedValue({
      revokedSessionIds: ['s1', 's2'],
    });
    authSet.mockRejectedValue(new Error('redis unavailable'));

    await expect(
      authService.revokeAllSessionsForSecurityEvent('user-1'),
    ).resolves.toBeUndefined();

    expect(repo.revokeAllSessionsForUser).toHaveBeenCalledWith('user-1', undefined);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.SESSIONS_REVOKED_ALL }),
    );
  });

  it('rejects an invalid reset token atomically and audits it', async () => {
    authGetDel.mockResolvedValue(null);
    await expect(
      authService.resetPassword('badtoken', 'NewStr0ngPass'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.updatePassword).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.PASSWORD_RESET_INVALID }),
    );
  });

  it('change-password rejects a wrong current password', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ passwordHash: pwHash }));
    await expect(
      authService.changePassword('user-1', 'sess-1', 'WRONGpass1', 'NewStr0ngPass'),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });
    expect(repo.updatePassword).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.PASSWORD_CHANGE_FAILED }),
    );
  });

  it('change-password rotates the hash and revokes other sessions', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ passwordHash: pwHash }));
    repo.revokeAllSessionsForUser.mockResolvedValue({ revokedSessionIds: ['s2'] });

    await authService.changePassword('user-1', 'sess-1', PASSWORD, 'NewStr0ngPass');
    expect(repo.updatePassword).toHaveBeenCalledOnce();
    // keeps the caller's current session alive
    expect(repo.revokeAllSessionsForUser).toHaveBeenCalledWith('user-1', 'sess-1');
  });
});

describe('session management & RBAC', () => {
  it('lists sessions flagging the current one', async () => {
    repo.findActiveSessionsByUser.mockResolvedValue([
      makeSession({ id: 'sess-1' }),
      makeSession({ id: 'sess-2' }),
    ]);
    const sessions = await authService.listSessions('user-1', 'sess-1');
    expect(sessions.find((s) => s.id === 'sess-1')?.current).toBe(true);
    expect(sessions.find((s) => s.id === 'sess-2')?.current).toBe(false);
  });

  it('revokeSession throws NotFound when nothing was revoked', async () => {
    repo.revokeSessionForUser.mockResolvedValue(0);
    await expect(
      authService.revokeSession('user-1', 'sess-x'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('getUserPermissions serves from cache without hitting the repo', async () => {
    authGet.mockResolvedValue(
      JSON.stringify({ roles: ['SUPPORT'], permissions: ['user.view'] }),
    );
    const res = await authService.getUserPermissions('user-1');
    expect(res.permissions).toEqual(['user.view']);
    expect(repo.getUserRolesAndPermissions).not.toHaveBeenCalled();
  });

  it('getUserPermissions falls back to the repo and caches on a miss', async () => {
    authGet.mockResolvedValue(null);
    repo.getUserRolesAndPermissions.mockResolvedValue({
      roles: ['FINANCE'],
      permissions: ['withdrawal.approve'],
    });
    const res = await authService.getUserPermissions('user-1');
    expect(res.roles).toEqual(['FINANCE']);
    expect(authSet).toHaveBeenCalledWith(
      'rbac:perms:user-1',
      expect.any(String),
      'EX',
      expect.any(Number),
    );
  });

  it('mandatory RBAC invalidation propagates Redis failures', async () => {
    authDel.mockRejectedValue(new Error('redis down'));
    await expect(
      authService.invalidatePermissionsAfterRoleChange('user-1'),
    ).rejects.toThrow('redis down');
  });

  it('validates access sessions against the durable DB state', async () => {
    repo.findSessionWithUserById.mockResolvedValue({
      ...makeSession(),
      user: makeUser(),
    });
    await expect(
      authService.validateAccessSession('user-1', 'sess-1'),
    ).resolves.toMatchObject({ id: 'user-1' });

    repo.findSessionWithUserById.mockResolvedValue({
      ...makeSession({ revokedAt: new Date() }),
      user: makeUser(),
    });
    await expect(
      authService.validateAccessSession('user-1', 'sess-1'),
    ).rejects.toMatchObject({ errorCode: 'SESSION_INVALID' });

    repo.findSessionWithUserById.mockResolvedValue({
      ...makeSession(),
      user: makeUser({ status: 'FROZEN' }),
    });
    await expect(
      authService.validateAccessSession('user-1', 'sess-1'),
    ).rejects.toMatchObject({ errorCode: 'SESSION_INVALID' });

    repo.findSessionWithUserById.mockResolvedValue({
      ...makeSession(),
      user: makeUser({ deletedAt: new Date() }),
    });
    await expect(
      authService.validateAccessSession('user-1', 'sess-1'),
    ).rejects.toMatchObject({ errorCode: 'SESSION_INVALID' });
  });
});

describe('authService.listActivity', () => {
  it('maps the user audit rows into activity events (newest first preserved)', async () => {
    repo.listUserAuditLogs.mockResolvedValue([
      {
        id: 2n,
        action: 'auth.password_changed',
        entityType: 'user',
        ip: '10.0.0.1',
        metadata: null,
        occurredAt: new Date('2026-06-19T10:00:00Z'),
      },
      {
        id: 1n,
        action: 'auth.login',
        entityType: 'user',
        ip: '10.0.0.1',
        metadata: null,
        occurredAt: new Date('2026-06-19T09:00:00Z'),
      },
    ] as never);

    const items = await authService.listActivity('user-1', 50);

    expect(repo.listUserAuditLogs).toHaveBeenCalledWith('user-1', 50);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: '2', action: 'auth.password_changed' });
    expect(items[1]).toMatchObject({ id: '1', action: 'auth.login' });
  });
});
