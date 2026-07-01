import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthSession, User } from '@prisma/client';

/**
 * Stage 7B — unit coverage for single active session enforcement + login
 * location capture. All IO boundaries are mocked; jwt/token signing stays real.
 */

vi.mock('../../src/modules/auth/auth.repository', () => ({
  authRepository: {
    createSession: vi.fn(),
    countSessionsForUser: vi.fn().mockResolvedValue(0),
    countSessionsForUserDevice: vi.fn().mockResolvedValue(1),
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
import { authRedisSet } from '../../src/lib/redis';
import { recordAudit, AuditAction } from '../../src/lib/audit';
import { config } from '../../src/config';

const repo = vi.mocked(authRepository);
const redisSet = vi.mocked(authRedisSet);
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
  repo.findOtherActiveSessions.mockResolvedValue([]);
  repo.revokeAllSessionsForUser.mockResolvedValue({ revokedSessionIds: [] });
});

describe('single active session (Stage 7B)', () => {
  it('revokes previous sessions and denylists them with NEW_LOGIN', async () => {
    repo.findOtherActiveSessions.mockResolvedValue([
      { id: 'old-1', ip: '1.1.1.1', deviceInfo: { userAgent: 'old' } },
    ] as never);

    await authService.issueSession(makeUser(), { ip: '2.2.2.2', userAgent: 'new' });

    expect(repo.revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
    expect(redisSet).toHaveBeenCalledWith(
      'session:revoked:old-1',
      'NEW_LOGIN',
      'EX',
      expect.any(Number),
    );
    const revokedAudit = audit.mock.calls.find(
      (c) => c[0].action === AuditAction.PREVIOUS_SESSION_REVOKED,
    );
    expect(revokedAudit).toBeDefined();
  });

  it('does nothing when there is no other active session', async () => {
    repo.findOtherActiveSessions.mockResolvedValue([]);
    await authService.issueSession(makeUser(), { ip: '2.2.2.2', userAgent: 'new' });
    expect(repo.revokeAllSessionsForUser).not.toHaveBeenCalled();
    const revokedAudit = audit.mock.calls.find(
      (c) => c[0].action === AuditAction.PREVIOUS_SESSION_REVOKED,
    );
    expect(revokedAudit).toBeUndefined();
  });

  it('stores the reduced-precision location on the new session', async () => {
    const loc = authService.enforceAndCaptureLoginLocation({
      latitude: 19.123456,
      longitude: 72.987654,
      accuracy: 30.7,
    });
    await authService.issueSession(makeUser(), {
      ip: '2.2.2.2',
      userAgent: 'new',
      location: loc,
    });
    expect(repo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceInfo: expect.objectContaining({
          userAgent: 'new',
          location: expect.objectContaining({ lat: 19.123, lng: 72.988 }),
        }),
      }),
    );
  });
});

describe('login location capture (Stage 7B)', () => {
  it('rounds coordinates and never derives a city/state', () => {
    const loc = authService.enforceAndCaptureLoginLocation({
      latitude: 19.123456,
      longitude: 72.987654,
    });
    expect(loc).toMatchObject({ lat: 19.123, lng: 72.988, accuracy: null });
    // No city/state/country is ever invented from coordinates.
    expect(JSON.stringify(loc)).not.toMatch(/mumbai|maharashtra|india/i);
  });

  it('treats out-of-range coordinates as no location', () => {
    expect(
      authService.enforceAndCaptureLoginLocation({ latitude: 999, longitude: 0 }),
    ).toBeNull();
  });

  it('does not require a location by default', () => {
    expect(config.auth.requireLoginLocation).toBe(false);
    expect(authService.enforceAndCaptureLoginLocation(undefined)).toBeNull();
  });

  it('throws LOCATION_REQUIRED when required and location is missing', () => {
    const original = config.auth.requireLoginLocation;
    (config.auth as { requireLoginLocation: boolean }).requireLoginLocation = true;
    try {
      expect(() =>
        authService.enforceAndCaptureLoginLocation(undefined),
      ).toThrowError();
      try {
        authService.enforceAndCaptureLoginLocation(undefined);
      } catch (err) {
        expect(err).toMatchObject({ errorCode: 'LOCATION_REQUIRED' });
      }
      // With a valid location, it passes and returns the rounded value.
      const ok = authService.enforceAndCaptureLoginLocation({
        latitude: 12.5,
        longitude: 77.5,
      });
      expect(ok).toMatchObject({ lat: 12.5, lng: 77.5 });
    } finally {
      (config.auth as { requireLoginLocation: boolean }).requireLoginLocation =
        original;
    }
  });
});
