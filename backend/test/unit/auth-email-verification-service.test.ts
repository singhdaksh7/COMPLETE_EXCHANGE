import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailOtp, User } from '@prisma/client';

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
    setEmailVerified: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../src/lib/mailer', () => ({
  mailer: { sendEmailOtp: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { authEmailVerificationService } from '../../src/modules/auth/auth.email-verification.service';
import { emailOtpRepository } from '../../src/modules/auth/auth.otp.repository';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { mailer } from '../../src/lib/mailer';
import { recordAudit } from '../../src/lib/audit';
import { hashOtp } from '../../src/lib/otp';

const otpRepo = vi.mocked(emailOtpRepository);
const userRepo = vi.mocked(authRepository);
const mailerMock = vi.mocked(mailer);
const auditMock = vi.mocked(recordAudit);

const EMAIL = 'newuser@example.com';
const CODE = '123456';

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: EMAIL,
    phone: null,
    passwordHash: 'argon2hash',
    status: 'ACTIVE',
    emailVerifiedAt: null,
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
    purpose: 'EMAIL_VERIFICATION',
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

describe('authEmailVerificationService.requestVerification', () => {
  it('creates a new unverified password user → issues a code under EMAIL_VERIFICATION purpose', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestByEmail.mockResolvedValue(null);
    otpRepo.create.mockResolvedValue(makeOtp());

    const res = await authEmailVerificationService.requestVerification(EMAIL, { ip: '1.1.1.1' });

    expect(res).toEqual({
      sent: true,
      alreadyVerified: false,
      expiresInSeconds: 600,
      resendCooldownSeconds: 60,
    });
    expect(otpRepo.invalidateActiveForEmail).toHaveBeenCalledWith(EMAIL, 'EMAIL_VERIFICATION');
    expect(otpRepo.create.mock.calls[0][0].purpose).toBe('EMAIL_VERIFICATION');
    expect(mailerMock.sendEmailOtp).toHaveBeenCalledWith(EMAIL, expect.any(String), 'EMAIL_VERIFICATION');
    // Never logs the code itself — only purpose + email metadata.
    const auditMeta = auditMock.mock.calls[0][0].metadata as Record<string, unknown>;
    expect(JSON.stringify(auditMeta)).not.toContain(mailerMock.sendEmailOtp.mock.calls[0][1]);
  });

  it('is enumeration-safe for an unknown email — generic response, nothing sent', async () => {
    userRepo.findUserByEmail.mockResolvedValue(null);
    const res = await authEmailVerificationService.requestVerification('nobody@example.com', {});
    expect(res).toEqual({ sent: true, alreadyVerified: false, expiresInSeconds: 600, resendCooldownSeconds: 60 });
    expect(otpRepo.create).not.toHaveBeenCalled();
    expect(mailerMock.sendEmailOtp).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-verified account — no code, no email', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: new Date() }));
    const res = await authEmailVerificationService.requestVerification(EMAIL, {});
    expect(res.alreadyVerified).toBe(true);
    expect(otpRepo.create).not.toHaveBeenCalled();
    expect(mailerMock.sendEmailOtp).not.toHaveBeenCalled();
  });

  it('refuses a disabled/archived account the same generic way', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser({ deletedAt: new Date() }));
    const res = await authEmailVerificationService.requestVerification(EMAIL, {});
    expect(res.alreadyVerified).toBe(false);
    expect(otpRepo.create).not.toHaveBeenCalled();
  });

  it('enforces the resend cooldown, scoped to EMAIL_VERIFICATION purpose', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestByEmail.mockResolvedValue(makeOtp({ lastSentAt: new Date() }));
    await expect(authEmailVerificationService.requestVerification(EMAIL, {})).rejects.toMatchObject({
      errorCode: 'OTP_COOLDOWN',
      statusCode: 429,
    });
    expect(otpRepo.findLatestByEmail).toHaveBeenCalledWith(EMAIL, 'EMAIL_VERIFICATION');
    expect(otpRepo.create).not.toHaveBeenCalled();
  });

  it('enforces the hourly cap', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestByEmail.mockResolvedValue(makeOtp({ lastSentAt: new Date(Date.now() - 120_000) }));
    otpRepo.countSentSince.mockResolvedValue(6);
    await expect(authEmailVerificationService.requestVerification(EMAIL, {})).rejects.toMatchObject({
      errorCode: 'OTP_RATE_LIMITED',
    });
  });

  it('does not extend/reset the code when a LOGIN-purpose code exists for the same email', async () => {
    // Regression guard for the cross-purpose collision fix: a LOGIN code's
    // cooldown/count must never gate an EMAIL_VERIFICATION request.
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestByEmail.mockResolvedValue(null); // repo is purpose-scoped; no EMAIL_VERIFICATION row yet
    otpRepo.create.mockResolvedValue(makeOtp());
    await authEmailVerificationService.requestVerification(EMAIL, {});
    expect(otpRepo.findLatestByEmail).toHaveBeenCalledWith(EMAIL, 'EMAIL_VERIFICATION');
    expect(otpRepo.create).toHaveBeenCalledOnce();
  });
});

describe('authEmailVerificationService.confirmVerification', () => {
  it('marks the account verified on a correct code and consumes it (single use)', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp());
    otpRepo.markUsed.mockResolvedValue(makeOtp({ usedAt: new Date() }));

    const res = await authEmailVerificationService.confirmVerification(EMAIL, CODE, { ip: '1.1.1.1' });

    expect(res).toEqual({ alreadyVerified: false });
    expect(otpRepo.findLatestActiveByEmail).toHaveBeenCalledWith(EMAIL, 'EMAIL_VERIFICATION');
    expect(otpRepo.markUsed).toHaveBeenCalledWith('otp-1');
    expect(userRepo.setEmailVerified).toHaveBeenCalledWith('user-1');
  });

  it('does NOT issue a session — the result carries no tokens', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp());
    otpRepo.markUsed.mockResolvedValue(makeOtp({ usedAt: new Date() }));
    const res = await authEmailVerificationService.confirmVerification(EMAIL, CODE, {});
    expect(res).not.toHaveProperty('tokens');
    expect(res).not.toHaveProperty('user');
  });

  it('is idempotent for an already-verified account — no OTP lookup needed', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: new Date() }));
    const res = await authEmailVerificationService.confirmVerification(EMAIL, CODE, {});
    expect(res).toEqual({ alreadyVerified: true });
    expect(otpRepo.findLatestActiveByEmail).not.toHaveBeenCalled();
  });

  it('rejects an unknown account generically (no enumeration leak)', async () => {
    userRepo.findUserByEmail.mockResolvedValue(null);
    await expect(
      authEmailVerificationService.confirmVerification('nobody@example.com', CODE, {}),
    ).rejects.toMatchObject({ errorCode: 'OTP_INVALID' });
  });

  it('rejects when no active code exists', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestActiveByEmail.mockResolvedValue(null);
    await expect(authEmailVerificationService.confirmVerification(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'OTP_INVALID',
    });
  });

  it('rejects an expired code', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(authEmailVerificationService.confirmVerification(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'OTP_EXPIRED',
    });
    expect(userRepo.setEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects a replayed (already-used) code', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp({ usedAt: new Date() }));
    await expect(authEmailVerificationService.confirmVerification(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'OTP_INVALID',
    });
  });

  it('rejects once attempts are exhausted, without extending expiry', async () => {
    const expiresAt = new Date(Date.now() + 600_000);
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp({ attempts: 5, maxAttempts: 5, expiresAt }));
    await expect(authEmailVerificationService.confirmVerification(EMAIL, CODE, {})).rejects.toMatchObject({
      errorCode: 'OTP_LOCKED',
    });
  });

  it('rejects a wrong code, increments attempts, never marks verified', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp());
    otpRepo.incrementAttempts.mockResolvedValue(makeOtp({ attempts: 1 }));
    await expect(authEmailVerificationService.confirmVerification(EMAIL, '000000', {})).rejects.toMatchObject({
      errorCode: 'OTP_INVALID',
    });
    expect(otpRepo.incrementAttempts).toHaveBeenCalledWith('otp-1');
    expect(otpRepo.markUsed).not.toHaveBeenCalled();
    expect(userRepo.setEmailVerified).not.toHaveBeenCalled();
  });

  it('locks when a wrong code pushes attempts to the max', async () => {
    userRepo.findUserByEmail.mockResolvedValue(makeUser());
    otpRepo.findLatestActiveByEmail.mockResolvedValue(makeOtp({ attempts: 4 }));
    otpRepo.incrementAttempts.mockResolvedValue(makeOtp({ attempts: 5 }));
    await expect(authEmailVerificationService.confirmVerification(EMAIL, '000000', {})).rejects.toMatchObject({
      errorCode: 'OTP_LOCKED',
    });
  });
});
