import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@prisma/client';

// Mock only the IO boundary (repository). argon2 hashing runs for real so the
// "unusable password" assertion is meaningful. Audit is a no-op.
vi.mock('../../src/modules/auth/auth.repository', () => ({
  authRepository: {
    findOAuthAccountWithUser: vi.fn(),
    findUserByEmail: vi.fn(),
    linkOAuthAccount: vi.fn(),
    createUserWithOAuth: vi.fn(),
  },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { authService } from '../../src/modules/auth/auth.service';
import { authRepository } from '../../src/modules/auth/auth.repository';

const repo = vi.mocked(authRepository);

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

const profile = (over: Record<string, unknown> = {}) => ({
  sub: 'g-sub-1',
  email: 'user@example.com',
  emailVerified: true,
  ...over,
});

describe('resolveGoogleUser linking rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the already-linked user without touching email lookup', async () => {
    const user = makeUser();
    repo.findOAuthAccountWithUser.mockResolvedValue({ user } as never);

    const result = await authService.resolveGoogleUser(profile(), {});

    expect(result).toBe(user);
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
  });

  it('blocks when Google has not verified the email', async () => {
    repo.findOAuthAccountWithUser.mockResolvedValue(null);

    await expect(
      authService.resolveGoogleUser(profile({ emailVerified: false }), {}),
    ).rejects.toMatchObject({ errorCode: 'OAUTH_EMAIL_UNVERIFIED' });
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
  });

  it('links Google to an existing VERIFIED local user', async () => {
    repo.findOAuthAccountWithUser.mockResolvedValue(null);
    const user = makeUser({ emailVerifiedAt: new Date() });
    repo.findUserByEmail.mockResolvedValue(user);
    repo.linkOAuthAccount.mockResolvedValue({} as never);

    const result = await authService.resolveGoogleUser(profile(), {});

    expect(result).toBe(user);
    expect(repo.linkOAuthAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'google',
        providerAccountId: 'g-sub-1',
      }),
    );
  });

  it('blocks linking to an existing UNVERIFIED local user (anti-takeover)', async () => {
    repo.findOAuthAccountWithUser.mockResolvedValue(null);
    repo.findUserByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));

    await expect(
      authService.resolveGoogleUser(profile(), {}),
    ).rejects.toMatchObject({ errorCode: 'OAUTH_LOCAL_ACCOUNT_UNVERIFIED' });
    expect(repo.linkOAuthAccount).not.toHaveBeenCalled();
  });

  it('creates a new OAuth-only user with an unusable argon2 password', async () => {
    repo.findOAuthAccountWithUser.mockResolvedValue(null);
    repo.findUserByEmail.mockResolvedValue(null);
    const created = makeUser({ id: 'new-1' });
    repo.createUserWithOAuth.mockResolvedValue(created);

    const result = await authService.resolveGoogleUser(profile(), {});

    expect(result).toBe(created);
    const arg = repo.createUserWithOAuth.mock.calls[0][0];
    expect(arg).toMatchObject({
      email: 'user@example.com',
      provider: 'google',
      providerAccountId: 'g-sub-1',
    });
    expect(arg.passwordHash).toMatch(/^\$argon2/);
  });
});
