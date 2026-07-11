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

  /**
   * Most recent UNUSED code for an email+purpose (the one a verify should
   * match). Purpose-scoped: LOGIN and EMAIL_VERIFICATION both apply to an
   * EXISTING user's email, so an unscoped lookup would let one purpose's
   * code satisfy a verify for the other — this filter is the fix.
   */
  findLatestActiveByEmail(email: string, purpose: EmailOtpPurpose): Promise<EmailOtp | null> {
    return prisma.emailOtp.findFirst({
      where: { email, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Most recent code of any state for an email+purpose — resend-cooldown calculation. */
  findLatestByEmail(email: string, purpose: EmailOtpPurpose): Promise<EmailOtp | null> {
    return prisma.emailOtp.findFirst({
      where: { email, purpose },
      orderBy: { createdAt: 'desc' },
    });
  },

  countSentSince(email: string, purpose: EmailOtpPurpose, since: Date): Promise<number> {
    return prisma.emailOtp.count({
      where: { email, purpose, createdAt: { gte: since } },
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

  /** Invalidate still-active codes for an email+purpose (called when issuing a new one). */
  async invalidateActiveForEmail(email: string, purpose: EmailOtpPurpose): Promise<number> {
    const result = await prisma.emailOtp.updateMany({
      where: { email, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count;
  },
};

export type EmailOtpRepository = typeof emailOtpRepository;
