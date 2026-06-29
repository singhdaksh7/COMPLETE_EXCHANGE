import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for user 2FA / security state. The ONLY place that talks to Prisma
 * for TOTP secrets and recovery (backup) codes.
 *
 * The TOTP secret is stored sealed (AES-256-GCM) in `users.totp_secret_enc`;
 * recovery codes are stored ONLY as SHA-256 hashes in `totp_recovery_codes`.
 * Plaintext seeds/codes never reach this layer's persistence.
 */
export const securityRepository = {
  findUserById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id: userId } });
  },

  /** Persist the sealed TOTP secret during enrollment (does NOT enable 2FA). */
  async setTotpSecret(userId: string, secretEnc: Buffer): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: secretEnc },
    });
  },

  /** Enable 2FA after a successful confirm. */
  async enableTotp(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
  },

  /**
   * Disable 2FA: clear the secret, flip the flag off, and delete all recovery
   * codes — atomically.
   */
  async disableTotp(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.totpRecoveryCode.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: { totpEnabled: false, totpSecretEnc: null },
      }),
    ]);
  },

  /** Replace a user's recovery codes with a fresh hashed set (atomic). */
  async replaceRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
    await prisma.$transaction([
      prisma.totpRecoveryCode.deleteMany({ where: { userId } }),
      prisma.totpRecoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  },

  countUnusedRecoveryCodes(userId: string): Promise<number> {
    return prisma.totpRecoveryCode.count({
      where: { userId, usedAt: null },
    });
  },

  /**
   * Atomically consume a recovery code: mark the matching UNUSED code used.
   * Returns true only if exactly one previously-unused code was updated, so a
   * concurrent reuse of the same code can never both succeed.
   */
  async consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    const result = await prisma.totpRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  },
};

export type SecurityRepository = typeof securityRepository;
