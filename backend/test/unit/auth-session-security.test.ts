import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthSession, User } from '@prisma/client';

// Mock IO boundaries; jwt/token signing stays real.
vi.mock('../../src/modules/auth/auth.repository', () => ({
  authRepository: {
    createSession: vi.fn(),
    findSessionWithUserById: vi.fn(),
    countSessionsForUser: vi.fn().mockResolvedValue(0),
    countSessionsForUserDevice: vi.fn().mockResolvedValue(1),
    touchSession: vi.fn().mockResolvedValue(1),
    // Stage 7B single-active-session enforcement (no-op here).
    findOtherActiveSessions: vi.fn().mockResolvedValue([]),
    revokeAllSessionsForUser: vi.fn().mockResolvedValue({ revokedSessionIds: [] }),
  },
}));

vi.mock('../../src/lib/redis', () => ({
  authRedisGet: vi.fn().mockResolvedValue(null),
  authRedisSet: vi.fn().mockResolvedValue('OK'),
  authRedisDel: vi.fn().mockResolvedValue(1),
  authRedisGetDel: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { authService } from '../../src/modules/auth/auth.service';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { recordAudit, AuditAction } from '../../src/lib/audit';

const repo = vi.mocked(authRepository);
const audit = vi.mocked(recordAudit);

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'u@e.com',
    phone: null,
    passwordHash: 'h',
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

beforeEach(() => {
  vi.clearAllMocks();
  repo.createSession.mockResolvedValue({} as AuthSession);
  repo.countSessionsForUser.mockResolvedValue(0);
  repo.countSessionsForUserDevice.mockResolvedValue(1);
  repo.touchSession.mockResolvedValue(1);
  repo.findOtherActiveSessions.mockResolvedValue([]);
  repo.revokeAllSessionsForUser.mockResolvedValue({ revokedSessionIds: [] });
});

describe('issueSession — new-device login signal (Stage 3D)', () => {
  it('does NOT flag a new device on the first-ever session', async () => {
    repo.countSessionsForUser.mockResolvedValue(0);
    repo.countSessionsForUserDevice.mockResolvedValue(0);
    await authService.issueSession(makeUser(), { ip: '1.1.1.1', userAgent: 'UA' });
    const newDevice = audit.mock.calls.find(
      (c) => c[0].action === AuditAction.LOGIN_NEW_DEVICE,
    );
    expect(newDevice).toBeUndefined();
  });

  it('flags a new device when prior sessions exist but none match this device', async () => {
    repo.countSessionsForUser.mockResolvedValue(3);
    repo.countSessionsForUserDevice.mockResolvedValue(0);
    await authService.issueSession(makeUser(), { ip: '9.9.9.9', userAgent: 'NewUA' });
    const newDevice = audit.mock.calls.find(
      (c) => c[0].action === AuditAction.LOGIN_NEW_DEVICE,
    );
    expect(newDevice).toBeDefined();
    expect(newDevice?.[0].entityType).toBe('auth_session');
  });

  it('does NOT flag a recognized device', async () => {
    repo.countSessionsForUser.mockResolvedValue(3);
    repo.countSessionsForUserDevice.mockResolvedValue(2);
    await authService.issueSession(makeUser(), { ip: '1.1.1.1', userAgent: 'UA' });
    const newDevice = audit.mock.calls.find(
      (c) => c[0].action === AuditAction.LOGIN_NEW_DEVICE,
    );
    expect(newDevice).toBeUndefined();
  });

  it('still returns a usable token pair regardless of the device signal', async () => {
    repo.countSessionsForUser.mockResolvedValue(3);
    repo.countSessionsForUserDevice.mockResolvedValue(0);
    const tokens = await authService.issueSession(makeUser(), {});
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });
});

describe('validateAccessSession — last-seen touch (Stage 3D)', () => {
  it('touches the session (best-effort) for a valid session', async () => {
    repo.findSessionWithUserById.mockResolvedValue({
      id: 'sess-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: makeUser(),
    } as never);
    await authService.validateAccessSession('user-1', 'sess-1');
    expect(repo.touchSession).toHaveBeenCalledWith('sess-1');
  });

  it('does not touch when the session is invalid', async () => {
    repo.findSessionWithUserById.mockResolvedValue(null);
    await expect(
      authService.validateAccessSession('user-1', 'sess-x'),
    ).rejects.toMatchObject({ errorCode: 'SESSION_INVALID' });
    expect(repo.touchSession).not.toHaveBeenCalled();
  });
});
