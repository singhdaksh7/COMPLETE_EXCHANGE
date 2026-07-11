import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@prisma/client';

// --- mock IO boundaries ---
vi.mock('../../src/modules/auth/auth.repository', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    findOAuthAccountWithUser: vi.fn(),
    findFederatedIdentityWithUser: vi.fn(),
    linkFederatedIdentity: vi.fn(),
    touchFederatedIdentityLastLogin: vi.fn(),
    createUserWithFederatedIdentity: vi.fn(),
    createSession: vi.fn(),
    countSessionsForUser: vi.fn().mockResolvedValue(0),
    countSessionsForUserDevice: vi.fn().mockResolvedValue(1),
    findOtherActiveSessions: vi.fn().mockResolvedValue([]),
    revokeAllSessionsForUser: vi.fn().mockResolvedValue({ revokedSessionIds: [] }),
    setEmailVerified: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../src/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), call: vi.fn() },
  authRedisGet: vi.fn().mockResolvedValue(null),
  authRedisGetDel: vi.fn().mockResolvedValue(null),
  authRedisSet: vi.fn().mockResolvedValue('OK'),
  authRedisDel: vi.fn().mockResolvedValue(1),
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../src/lib/federated-identity-verifier', () => ({
  firebaseIdentityVerifier: {
    configured: true,
    verifyIdToken: vi.fn(),
  },
}));

vi.mock('../../src/lib/mailer', () => ({
  mailer: { sendEmailOtp: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/modules/user-security/user-security.service', () => ({
  securityService: { issueLoginChallenge: vi.fn() },
}));

vi.mock('../../src/modules/legal/legal.service', () => ({
  legalService: { accept: vi.fn().mockResolvedValue(undefined) },
}));

import { authFederatedService } from '../../src/modules/auth/auth.federated.service';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { firebaseIdentityVerifier } from '../../src/lib/federated-identity-verifier';
import { authRedisGet, authRedisGetDel, authRedisSet } from '../../src/lib/redis';
import { recordAudit } from '../../src/lib/audit';
import { config } from '../../src/config';
import { hashOtp } from '../../src/lib/otp';

const repo = vi.mocked(authRepository);
const verifier = vi.mocked(firebaseIdentityVerifier);
const authGet = vi.mocked(authRedisGet);
const authGetDel = vi.mocked(authRedisGetDel);
const authSet = vi.mocked(authRedisSet);
const audit = vi.mocked(recordAudit);

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

const IDENTITY = {
  uid: 'firebase-uid-1',
  subject: 'google-sub-1',
  email: 'user@example.com',
  emailVerified: true,
  provider: 'GOOGLE' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  config.federatedAuth.enabled = true;
  verifier.configured = true;
  authGet.mockResolvedValue(null);
  authGetDel.mockResolvedValue(null);
  authSet.mockResolvedValue('OK');
  // Both are called with `.catch(() => undefined)` in the service (best-effort
  // side effects) — they must resolve to a real promise, not vi.fn()'s bare
  // `undefined` return, or that `.catch` call throws.
  repo.linkFederatedIdentity.mockResolvedValue({} as never);
  repo.touchFederatedIdentityLastLogin.mockResolvedValue({ count: 1 } as never);
  repo.createSession.mockResolvedValue({
    id: 'sess-1',
    userId: 'user-1',
    refreshHash: 'h',
    familyId: 'fam-1',
    deviceInfo: null,
    ip: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
  } as never);
});

describe('authFederatedService.login', () => {
  it('rejects when federated auth is disabled', async () => {
    config.federatedAuth.enabled = false;
    await expect(
      authFederatedService.login({ idToken: 't', provider: 'GOOGLE' }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_AUTH_DISABLED' });
  });

  it('rejects when the verifier is not configured', async () => {
    verifier.verifyIdToken.mockRejectedValue(
      Object.assign(new Error('unavailable'), { errorCode: 'SERVICE_UNAVAILABLE', statusCode: 503, isOperational: true, name: 'ServiceUnavailableError' }),
    );
    await expect(
      authFederatedService.login({ idToken: 't', provider: 'GOOGLE' }),
    ).rejects.toThrow();
  });

  it('rejects an invalid/expired token', async () => {
    verifier.verifyIdToken.mockRejectedValue(new Error('invalid token'));
    await expect(
      authFederatedService.login({ idToken: 'bad', provider: 'GOOGLE' }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_TOKEN_INVALID' });
  });

  it('rejects a provider mismatch', async () => {
    verifier.verifyIdToken.mockResolvedValue({ ...IDENTITY, provider: 'APPLE' });
    await expect(
      authFederatedService.login({ idToken: 't', provider: 'GOOGLE' }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_PROVIDER_MISMATCH' });
  });

  it('rejects an unverified email', async () => {
    verifier.verifyIdToken.mockResolvedValue({ ...IDENTITY, emailVerified: false });
    await expect(
      authFederatedService.login({ idToken: 't', provider: 'GOOGLE' }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_EMAIL_UNVERIFIED' });
  });

  it('logs in a user already linked via UserFederatedIdentity', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY);
    repo.findFederatedIdentityWithUser.mockResolvedValue({
      id: 'fed-1',
      user: makeUser(),
    } as never);

    const result = await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(result.status).toBe('AUTHENTICATED');
    expect(repo.touchFederatedIdentityLastLogin).toHaveBeenCalledWith('fed-1');
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
  });

  it('marks a not-yet-verified existing user verified on a server-verified Firebase claim', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY); // emailVerified: true
    repo.findFederatedIdentityWithUser.mockResolvedValue({
      id: 'fed-1',
      user: makeUser({ emailVerifiedAt: null }),
    } as never);

    await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(repo.setEmailVerified).toHaveBeenCalledWith('user-1');
  });

  it('never re-calls setEmailVerified for an already-verified user (idempotent)', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY);
    repo.findFederatedIdentityWithUser.mockResolvedValue({
      id: 'fed-1',
      user: makeUser({ emailVerifiedAt: new Date() }),
    } as never);

    await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(repo.setEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects login entirely for an unverified Firebase claim — never reaches (and never marks) any user', async () => {
    verifier.verifyIdToken.mockResolvedValue({ ...IDENTITY, emailVerified: false });
    await expect(
      authFederatedService.login({ idToken: 't', provider: 'GOOGLE' }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_EMAIL_UNVERIFIED' });
    expect(repo.setEmailVerified).not.toHaveBeenCalled();
  });

  it('logs in and lazily migrates a legacy OAuthAccount (Google) user', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY);
    repo.findFederatedIdentityWithUser.mockResolvedValue(null);
    repo.findOAuthAccountWithUser.mockResolvedValue({
      id: 'oauth-1',
      user: makeUser(),
    } as never);

    const result = await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(result.status).toBe('AUTHENTICATED');
    expect(repo.linkFederatedIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', provider: 'GOOGLE', providerSubject: 'google-sub-1' }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'federated.identity_linked', metadata: expect.objectContaining({ reason: 'legacy_oauth_migration' }) }),
    );
  });

  it('CASE B: legacy OAuthAccount resolves by subject only — never cross-links by email to a different user', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY); // email: user@example.com
    repo.findFederatedIdentityWithUser.mockResolvedValue(null);
    // The legacy OAuthAccount is keyed to User A (id 'user-1'); some OTHER
    // user ('user-B') happens to own the verified email in this scenario.
    repo.findOAuthAccountWithUser.mockResolvedValue({ id: 'oauth-1', user: makeUser({ id: 'user-1' }) } as never);
    repo.findUserByEmail.mockResolvedValue(makeUser({ id: 'user-B', email: 'user@example.com' }));

    const result = await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(result.status).toBe('AUTHENTICATED');
    if (result.status === 'AUTHENTICATED' && 'user' in result.result) {
      expect(result.result.user.id).toBe('user-1'); // User A, never User B
    }
    // The subject-keyed match short-circuits before any email lookup — email
    // is never consulted on this path, so it can never steer resolution
    // toward a different account.
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
  });

  it('CASE C: an already-linked Firebase identity never re-touches the legacy OAuthAccount table (no duplicate)', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY);
    repo.findFederatedIdentityWithUser.mockResolvedValue({ id: 'fed-1', user: makeUser() } as never);

    await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(repo.findOAuthAccountWithUser).not.toHaveBeenCalled();
    expect(repo.linkFederatedIdentity).not.toHaveBeenCalled();
  });

  it('never auto-links a verified-email match — returns ACCOUNT_LINK_REQUIRED', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY);
    repo.findFederatedIdentityWithUser.mockResolvedValue(null);
    repo.findOAuthAccountWithUser.mockResolvedValue(null);
    repo.findUserByEmail.mockResolvedValue(makeUser());

    const result = await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(result).toMatchObject({ status: 'ACCOUNT_LINK_REQUIRED', maskedEmail: expect.any(String) });
    expect(repo.linkFederatedIdentity).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'federated.identity_link_required' }),
    );
  });

  it('returns FEDERATED_REGISTRATION_REQUIRED for a brand-new identity', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY);
    repo.findFederatedIdentityWithUser.mockResolvedValue(null);
    repo.findOAuthAccountWithUser.mockResolvedValue(null);
    repo.findUserByEmail.mockResolvedValue(null);

    const result = await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(result).toMatchObject({
      status: 'FEDERATED_REGISTRATION_REQUIRED',
      email: 'user@example.com',
    });
  });

  it('blocks an archived (soft-deleted) account', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY);
    repo.findFederatedIdentityWithUser.mockResolvedValue({
      id: 'fed-1',
      user: makeUser({ deletedAt: new Date() }),
    } as never);

    await expect(
      authFederatedService.login({ idToken: 't', provider: 'GOOGLE' }),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_DISABLED' });
  });

  it('returns a 2FA challenge (no session) for a TOTP-enabled linked user', async () => {
    verifier.verifyIdToken.mockResolvedValue(IDENTITY);
    repo.findFederatedIdentityWithUser.mockResolvedValue({
      id: 'fed-1',
      user: makeUser({ totpEnabled: true }),
    } as never);
    const { securityService } = await import('../../src/modules/user-security/user-security.service');
    vi.mocked(securityService.issueLoginChallenge).mockResolvedValue('challenge-token');

    const result = await authFederatedService.login({ idToken: 't', provider: 'GOOGLE' });

    expect(result.status).toBe('AUTHENTICATED');
    if (result.status === 'AUTHENTICATED') {
      expect(result.result).toMatchObject({ twoFactorRequired: true, challengeToken: 'challenge-token' });
    }
    expect(repo.createSession).not.toHaveBeenCalled();
  });
});

const REGISTER_PAYLOAD = JSON.stringify({
  purpose: 'REGISTER_NEW',
  provider: 'GOOGLE',
  firebaseUid: 'firebase-uid-1',
  providerSubject: 'google-sub-1',
  email: 'new@example.com',
});

const LINK_PAYLOAD = JSON.stringify({
  purpose: 'LINK_EXISTING',
  provider: 'GOOGLE',
  firebaseUid: 'firebase-uid-1',
  providerSubject: 'google-sub-1',
  email: 'existing@example.com',
  existingUserId: 'user-1',
});

/** consumeChallenge() peeks via GET then consumes via GETDEL — both must
 * resolve the same payload for a "challenge exists" scenario. */
function mockChallengeExists(payload: string): void {
  authGet.mockResolvedValue(payload);
  authGetDel.mockResolvedValue(payload);
}

const POLICIES = { termsOfService: true as const, privacyPolicy: true as const, riskDisclosure: true as const };

describe('authFederatedService.confirmLink / completeRegistration', () => {
  it('rejects confirmLink with an invalid/expired challenge', async () => {
    authGet.mockResolvedValue(null);
    await expect(
      authFederatedService.confirmLink({ challengeToken: 'bogus', otp: '123456' }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_CHALLENGE_INVALID' });
  });

  it('rejects completeRegistration with an invalid/expired challenge', async () => {
    authGet.mockResolvedValue(null);
    await expect(
      authFederatedService.completeRegistration({
        challengeToken: 'bogus',
        phone: '+919999999999',
        acceptedPolicies: POLICIES,
      }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_CHALLENGE_INVALID' });
  });

  it('completes registration for a new federated identity without a fake password prompt', async () => {
    mockChallengeExists(REGISTER_PAYLOAD);
    repo.createUserWithFederatedIdentity.mockResolvedValue(makeUser({ id: 'user-2', email: 'new@example.com' }));

    const result = await authFederatedService.completeRegistration({
      challengeToken: 'tok',
      phone: '+919999999999',
      acceptedPolicies: POLICIES,
    });

    expect(result.status).toBe('AUTHENTICATED');
    expect(repo.createUserWithFederatedIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', phone: '+919999999999', provider: 'GOOGLE' }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'federated.user_registered' }),
    );
    // The challenge only exists because login()'s own !verified.emailVerified
    // check already passed, so the brand-new account is marked verified too.
    expect(repo.setEmailVerified).toHaveBeenCalledWith('user-2');
  });

  it('duplicate registration completion is prevented (single-use challenge / replay rejected)', async () => {
    mockChallengeExists(REGISTER_PAYLOAD);
    repo.createUserWithFederatedIdentity.mockResolvedValue(makeUser({ id: 'user-3', email: 'new@example.com' }));

    const input = { challengeToken: 'tok', phone: '+919999999999', acceptedPolicies: POLICIES };
    await authFederatedService.completeRegistration(input);

    // The redeemed challenge is gone (GETDEL semantics) — a replay finds nothing.
    authGet.mockResolvedValue(null);
    authGetDel.mockResolvedValue(null);
    await expect(authFederatedService.completeRegistration(input)).rejects.toMatchObject({
      errorCode: 'FEDERATED_CHALLENGE_INVALID',
    });
  });

  it('a LINK_EXISTING challenge submitted to the REGISTER endpoint is rejected WITHOUT being consumed', async () => {
    mockChallengeExists(LINK_PAYLOAD);

    await expect(
      authFederatedService.completeRegistration({
        challengeToken: 'tok',
        phone: '+919999999999',
        acceptedPolicies: POLICIES,
      }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_CHALLENGE_INVALID' });
    // Purpose mismatch must short-circuit BEFORE the consuming GETDEL —
    // the token stays valid for its actual (LINK) endpoint.
    expect(authGetDel).not.toHaveBeenCalled();
  });

  it('a REGISTER_NEW challenge submitted to the LINK endpoint is rejected WITHOUT being consumed', async () => {
    mockChallengeExists(REGISTER_PAYLOAD);

    await expect(
      authFederatedService.confirmLink({ challengeToken: 'tok', otp: '123456' }),
    ).rejects.toMatchObject({ errorCode: 'FEDERATED_CHALLENGE_INVALID' });
    expect(authGetDel).not.toHaveBeenCalled();
  });

  it('confirmLink succeeds and creates exactly one identity link + session via normal controls', async () => {
    mockChallengeExists(LINK_PAYLOAD);
    repo.findUserById.mockResolvedValue(makeUser({ id: 'user-1', email: 'existing@example.com' }));
    authGet.mockImplementation((key: string) =>
      key.includes('link-otp')
        ? Promise.resolve(JSON.stringify({ hash: hashOtp('existing@example.com', '654321'), attempts: 0, expiresAt: Date.now() + 600_000 }))
        : Promise.resolve(LINK_PAYLOAD),
    );

    const result = await authFederatedService.confirmLink({ challengeToken: 'tok', otp: '654321' });

    expect(result.status).toBe('AUTHENTICATED');
    expect(repo.linkFederatedIdentity).toHaveBeenCalledTimes(1);
    expect(repo.createSession).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'federated.identity_linked' }));
  });

  it('rejects a wrong OTP without consuming the link challenge', async () => {
    mockChallengeExists(LINK_PAYLOAD);
    authGet.mockImplementation((key: string) =>
      key.includes('link-otp')
        ? Promise.resolve(JSON.stringify({ hash: hashOtp('existing@example.com', '111111'), attempts: 0, expiresAt: Date.now() + 600_000 }))
        : Promise.resolve(LINK_PAYLOAD),
    );

    await expect(
      authFederatedService.confirmLink({ challengeToken: 'tok', otp: '000000' }),
    ).rejects.toMatchObject({ errorCode: 'OTP_INVALID' });
  });

  it('locks the link OTP after too many wrong attempts', async () => {
    mockChallengeExists(LINK_PAYLOAD);
    authGet.mockImplementation((key: string) =>
      key.includes('link-otp')
        ? Promise.resolve(JSON.stringify({ hash: hashOtp('existing@example.com', '111111'), attempts: 5, expiresAt: Date.now() + 600_000 }))
        : Promise.resolve(LINK_PAYLOAD),
    );

    await expect(
      authFederatedService.confirmLink({ challengeToken: 'tok', otp: '000000' }),
    ).rejects.toMatchObject({ errorCode: 'OTP_LOCKED' });
  });

  it('rejects an expired link OTP even if the Redis key technically still exists', async () => {
    mockChallengeExists(LINK_PAYLOAD);
    authGet.mockImplementation((key: string) =>
      key.includes('link-otp')
        ? Promise.resolve(
            JSON.stringify({ hash: hashOtp('existing@example.com', '654321'), attempts: 0, expiresAt: Date.now() - 1 }),
          )
        : Promise.resolve(LINK_PAYLOAD),
    );

    await expect(
      authFederatedService.confirmLink({ challengeToken: 'tok', otp: '654321' }),
    ).rejects.toMatchObject({ errorCode: 'OTP_INVALID' });
  });

  it('a failed OTP attempt never extends the Redis TTL past the original deadline', async () => {
    mockChallengeExists(LINK_PAYLOAD);
    const expiresAt = Date.now() + 600_000;
    authGet.mockImplementation((key: string) =>
      key.includes('link-otp')
        ? Promise.resolve(JSON.stringify({ hash: hashOtp('existing@example.com', '111111'), attempts: 0, expiresAt }))
        : Promise.resolve(LINK_PAYLOAD),
    );

    await expect(
      authFederatedService.confirmLink({ challengeToken: 'tok', otp: '000000' }),
    ).rejects.toMatchObject({ errorCode: 'OTP_INVALID' });

    const rewriteCall = authSet.mock.calls.find(([key]) => key.includes('link-otp'));
    expect(rewriteCall).toBeDefined();
    const ttlUsed = rewriteCall![3] as number;
    expect(ttlUsed).toBeLessThanOrEqual(expiresAt - Date.now() + 50); // never the full 10-minute window again
  });

  it('an OTP for a different challenge/user cannot redeem this one (separate Redis key per challenge)', async () => {
    // No OTP stored under THIS challenge's key -> immediate OTP_INVALID,
    // regardless of what a plausible-looking 6-digit code is supplied.
    mockChallengeExists(LINK_PAYLOAD);
    authGet.mockImplementation((key: string) => (key.includes('link-otp') ? Promise.resolve(null) : Promise.resolve(LINK_PAYLOAD)));

    await expect(
      authFederatedService.confirmLink({ challengeToken: 'tok', otp: '654321' }),
    ).rejects.toMatchObject({ errorCode: 'OTP_INVALID' });
  });
});
