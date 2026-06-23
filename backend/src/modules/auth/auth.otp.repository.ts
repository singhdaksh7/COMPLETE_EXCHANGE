import type { EmailOtp, EmailOtpPurpose } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Persistence for email-OTP rows. The ONLY place that talks to Prisma for the
 * `email_otps` table. The plaintext code never reaches this layer — callers
 * pass the precomputed keyed hash.
 */
export const emailOtpRepository = {
  create(data: {
    email: string;
    otpHash: string;
    purpose: EmailOtpPurpose;
    expiresAt: Date;
    maxAttempts: number;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<EmailOtp> {
    return prisma.emailOtp.create({
      data: {
        email: data.email,
        otpHash: data.otpHash,
        purpose: data.purpose,
        expiresAt: data.expiresAt,
        maxAttempts: data.maxAttempts,
        lastSentAt: new Date(),
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  },

  /** Most recent UNUSED code for an email (the one a verify should match). */
  findLatestActiveByEmail(email: string): Promise<EmailOtp | null> {
    return prisma.emailOtp.findFirst({
      where: { email, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Most recent code of any state — used for resend-cooldown calculation. */
  findLatestByEmail(email: string): Promise<EmailOtp | null> {
    return prisma.emailOtp.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
  },

  countSentSince(email: string, since: Date): Promise<number> {
    return prisma.emailOtp.count({
      where: { email, createdAt: { gte: since } },
    });
  },

  /**
   * Atomically increment attempts and return the updated row. Used on every
   * wrong-code verify so a code locks once it hits maxAttempts.
   */
  incrementAttempts(id: string): Promise<EmailOtp> {
    return prisma.emailOtp.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  },

  /** Mark a code consumed (single-use). */
  markUsed(id: string): Promise<EmailOtp> {
    return prisma.emailOtp.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  },

  /** Invalidate all still-active codes for an email (called when issuing a new one). */
  async invalidateActiveForEmail(email: string): Promise<number> {
    const result = await prisma.emailOtp.updateMany({
      where: { email, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count;
  },
};

export type EmailOtpRepository = typeof emailOtpRepository;
