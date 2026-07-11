import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailOtp, User } from '@prisma/client';

// --- mock IO boundaries; keep lib/otp (hash/verify) and config REAL ----------
vi.mock('../../src/modules/auth/auth.otp.repository', () => ({
  emailOtpRepository: {
    create: vi.fn(),
    findLatestActiveByEmail: vi.fn(),
    findLatestByEmail: vi.fn(),
    countSentSince: vi.fn().mockResolvedValue(0),
    incrementAttempts: vi.fn(),
    markUsed: vi.fn(),
    invalidateActiveForEmail: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../src/modules/auth/auth.repository', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    createUser: vi.fn(),
    setEmailVerified: vi.fn().mockResolvedValue(1),
    recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
  },
}));

// Keep the real toPublicUser; stub issueSession so no JWT/session DB is needed.
vi.mock('../../src/modules/auth/auth.service', async (orig) => {
  const actual = await orig<typeof import('../../src/modules/auth/auth.service')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      issueSession: vi
        .fn()
        .mockResolvedValue({ accessToken: 'access.jwt', refreshToken: 'refresh.jwt' }),
    },
  };
});

vi.mock('../../src/lib/mailer', () => ({
  mailer: { sendEmailOtp: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { authOtpService } from '../../src/modules/auth/auth.otp.service';
import { emailOtpRepository } from '../../src/modules/auth/auth.otp.repository';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { mailer } from '../../src/lib/mailer';
import { hashOtp } from '../../src/lib/otp';

const otpRepo = vi.mocked(emailOtpRepository);
const userRepo = vi.mocked(authRepository);
const mailerMock = vi.mocked(mailer);

const EMAIL = 'user@example.com';
const CODE = '654321';

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: EMAIL,
    phone: null,
    passwordHash: 'argon2hash',
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

function makeOtp(over: Partial<EmailOtp> = {}): EmailOtp {
  return {
    id: 'otp-1',
    email: EMAIL,
    otpHash: hashOtp(EMAIL, CODE),
    purpose: 'LOGIN',
    expiresAt: new Date(Date.now() + 600_000),
    usedAt: null,
    attempts: 0,
    maxAttempts: 5,
    lastSentAt: new Date(),
    createdAt: new Date(),
    ipAddress: null,
    userAgent: null,
    ...over,
  } as EmailOtp;
}

beforeEach(() => {
  vi.clearAllMocks();
  otpRepo.countSentSince.mockResolvedValue(0);
  otpRepo.invalidateActiveForEmail.mockResolvedValue(0);
  userRepo.setEmailVerified.mockResolvedValue(1);
});

describe('requestOtp', () => {
  it('issues + sends a code and returns a generic result (no account)', async () => {
    otpRepo.findLatestByEmail.mockResolvedValue(null);
    userRepo.findUserByEmail.mockResolvedValue(null); // SIGNUP purpose
    otpRepo.create.mockResolvedValue(makeOtp({ purpose: 'SIGNUP' }));

    const res = await authOtpService.requestOtp(EMAIL, { ip: '1.1.1.1' });

    expect(otpRepo.invalidateActiveForEmail).toHaveBeenCalledWith(EMAIL, 'SIGNUP');
    expect(otpRepo.create).toHaveBeenCalledOnce();
    expect(mailerMock.sendEmailOtp).toHaveBeenCalledOnce();
    expect(res.sent).toBe(true);
    expect(res.expiresInSeconds).toBe(600);
    expect(res.resendCooldownSeconds).toBe(60);
    // The create call must persist the purpose derived from existence (SIGNUP).
    expect(otpRepo.create.mock.calls[0][0].purpose).toBe('SIGNUP');
  });

  it('derives LOGIN purpose when the account exists', async () => {
    otpRepo.findLatestByEmail.mockResolvedValue(null);
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.create.mockResolvedValue(makeOtp());
    await authOtpService.requestOtp(EMAIL, {});
    expect(otpRepo.create.mock.calls[0][0].purpose).toBe('LOGIN');
  });

  it('enforces the resend cooldown', async () => {
    otpRepo.findLatestByEmail.mockResolvedValue(makeOtp({ lastSentAt: new Date() }));
    await expect(authOtpService.requestOtp(EMAIL, {})).rejects.toMatchObject({
      errorCode: 'OTP_COOLDOWN',
      statusCode: 429,
    });
    expect(otpRepo.create).not.toHaveBeenCalled();
  });

  it('enforces the hourly cap', async () => {
    otpRepo.findLatestByEmail.mockResolvedValue(
      makeOtp({ lastSentAt: new Date(Date.now() - 120_000) }),
    );
    otpRepo.countSentSince.mockResolvedValue(6);
    await expect(authOtpService.requestOtp(EMAIL, {})).rejects.toMatchObject({
      errorCode: 'OTP_RATE_LIMITED',
    });
  });
});

describe('verifyOtp', () => {
  it('logs in an existing user on a correct code and consumes it', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp());
    otpRepo.markUsed.mockResolvedValue(makeOtp({ usedAt: new Date() }));
    userRepo.findUserByEmail.mockResolvedValue(makeUser());

    const res = await authOtpService.verifyOtp(EMAIL, CODE, { ip: '1.1.1.1' });

    expect(otpRepo.markUsed).toHaveBeenCalledWith('otp-1');
    expect(res.isNewUser).toBe(false);
    expect(res.tokens.accessToken).toBe('access.jwt');
    expect(userRepo.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    expect(userRepo.createUser).not.toHaveBeenCalled();
  });

  it('creates a new passwordless verified user on signup', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp({ purpose: 'SIGNUP' }));
    otpRepo.markUsed.mockResolvedValue(makeOtp({ usedAt: new Date() }));
    userRepo.findUserByEmail.mockResolvedValue(null);
    userRepo.createUser.mockResolvedValue(makeUser({ id: 'new-user', emailVerifiedAt: null }));

    const res = await authOtpService.verifyOtp(EMAIL, CODE, {});

    expect(userRepo.createUser).toHaveBeenCalledOnce();
    expect(userRepo.setEmailVerified).toHaveBeenCalledWith('new-user');
    expect(res.isNewUser).toBe(true);
    expect(res.tokens.refreshToken).toBe('refresh.jwt');
  });

  it('marks an unverified existing user verified on success', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp());
    otpRepo.markUsed.mockResolvedValue(makeOtp({ usedAt: new Date() }));
    userRepo.findUserByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));
    await authOtpService.verifyOtp(EMAIL, CODE, {});
    expect(userRepo.setEmailVerified).toHaveBeenCalledWith('user-1');
  });

  it('rejects when no active code exists', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(null);
    await expect(authOtpService.verifyOtp(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'OTP_INVALID',
    });
  });

  it('rejects an expired code', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(
      makeOtp({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(authOtpService.verifyOtp(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'OTP_EXPIRED',
    });
  });

  it('rejects an already-used code', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp({ usedAt: new Date() }));
    await expect(authOtpService.verifyOtp(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'OTP_INVALID',
    });
  });

  it('locks once attempts reach the max', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(
      makeOtp({ attempts: 5, maxAttempts: 5 }),
    );
    await expect(authOtpService.verifyOtp(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'OTP_LOCKED',
    });
  });

  it('increments attempts and records a failed login attempt on a wrong code', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp());
    otpRepo.incrementAttempts.mockResolvedValue(makeOtp({ attempts: 1 }));
    await expect(authOtpService.verifyOtp(EMAIL, '000000', {})).rejects.toMatchObject({
      errorCode: 'OTP_INVALID',
    });
    expect(otpRepo.incrementAttempts).toHaveBeenCalledWith('otp-1');
    expect(userRepo.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
    expect(otpRepo.markUsed).not.toHaveBeenCalled();
  });

  it('locks when the wrong code pushes attempts to the max', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp({ attempts: 4 }));
    otpRepo.incrementAttempts.mockResolvedValue(makeOtp({ attempts: 5 }));
    await expect(authOtpService.verifyOtp(EMAIL, '000000', {})).rejects.toMatchObject({
      errorCode: 'OTP_LOCKED',
    });
  });

  it('refuses a non-active account even with a correct code', async () => {
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp());
    otpRepo.markUsed.mockResolvedValue(makeOtp({ usedAt: new Date() }));
    userRepo.findUserByEmail.mockResolvedValue(makeUser({ status: 'FROZEN' }));
    await expect(authOtpService.verifyOtp(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'ACCOUNT_NOT_ACTIVE',
    });
  });
});
