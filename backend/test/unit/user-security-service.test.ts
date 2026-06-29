import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import type { User } from '@prisma/client';

// Mock IO boundaries; encryption, totp, and token hashing run for real.
vi.mock('../../src/modules/user-security/user-security.repository', () => ({
  securityRepository: {
    findUserById: vi.fn(),
    setTotpSecret: vi.fn().mockResolvedValue(undefined),
    enableTotp: vi.fn().mockResolvedValue(undefined),
    disableTotp: vi.fn().mockResolvedValue(undefined),
    replaceRecoveryCodes: vi.fn().mockResolvedValue(undefined),
    countUnusedRecoveryCodes: vi.fn().mockResolvedValue(0),
    consumeRecoveryCode: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('../../src/lib/redis', () => ({
  authRedisGet: vi.fn().mockResolvedValue(null),
  authRedisGetDel: vi.fn().mockResolvedValue(null),
  authRedisSet: vi.fn().mockResolvedValue('OK'),
  authRedisCall: vi.fn().mockResolvedValue(1),
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { securityService } from '../../src/modules/user-security/user-security.service';
import { securityRepository } from '../../src/modules/user-security/user-security.repository';
import {
  authRedisGet,
  authRedisGetDel,
  authRedisSet,
} from '../../src/lib/redis';
import { recordAudit, AuditAction } from '../../src/lib/audit';
import { encryptPII, decryptPII } from '../../src/lib/encryption';
import { generateTotpSecret, totpCode } from '../../src/lib/totp';

const repo = vi.mocked(securityRepository);
const redisGet = vi.mocked(authRedisGet);
const redisGetDel = vi.mocked(authRedisGetDel);
const redisSet = vi.mocked(authRedisSet);
const audit = vi.mocked(recordAudit);

const PASSWORD = 'Str0ngPassword';
let pwHash = '';

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'x',
    totpEnabled: false,
    totpSecretEnc: null,
    status: 'ACTIVE',
    ...over,
  } as unknown as User;
}

/** Seal a base32 secret the same way the service does for storage. */
function sealed(secret: string): Buffer {
  return encryptPII(secret);
}

beforeAll(async () => {
  pwHash = await hash(PASSWORD);
});

beforeEach(() => {
  vi.clearAllMocks();
  redisGet.mockResolvedValue(null);
  redisGetDel.mockResolvedValue(null);
  redisSet.mockResolvedValue('OK');
  repo.countUnusedRecoveryCodes.mockResolvedValue(0);
  repo.consumeRecoveryCode.mockResolvedValue(false);
});

describe('status', () => {
  it('reports disabled with no backup codes', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ totpEnabled: false }));
    expect(await securityService.status('user-1')).toEqual({
      enabled: false,
      backupCodesRemaining: 0,
    });
  });

  it('reports enabled with remaining backup codes', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ totpEnabled: true }));
    repo.countUnusedRecoveryCodes.mockResolvedValue(7);
    expect(await securityService.status('user-1')).toEqual({
      enabled: true,
      backupCodesRemaining: 7,
    });
  });
});

describe('setup', () => {
  it('returns an otpauth URI + secret and stores the secret ENCRYPTED (not enabled)', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ totpEnabled: false }));

    const result = await securityService.setup('user-1');

    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    expect(result.otpauthUri).toContain('otpauth://totp/');
    // Stored secret is sealed: not plaintext, and decrypts back to the secret.
    expect(repo.setTotpSecret).toHaveBeenCalledTimes(1);
    const storedEnc = repo.setTotpSecret.mock.calls[0][1] as Buffer;
    expect(storedEnc.toString('utf8')).not.toContain(result.secret);
    expect(decryptPII(storedEnc)).toBe(result.secret);
    // Enrollment never enables 2FA before confirmation.
    expect(repo.enableTotp).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.TWO_FA_SETUP_STARTED }),
    );
  });

  it('rejects setup when 2FA is already enabled', async () => {
    repo.findUserById.mockResolvedValue(makeUser({ totpEnabled: true }));
    await expect(securityService.setup('user-1')).rejects.toMatchObject({
      errorCode: 'TWO_FA_ALREADY_ENABLED',
    });
  });
});

describe('confirm', () => {
  it('enables 2FA and issues 10 backup codes on a valid code', async () => {
    const secret = generateTotpSecret();
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: false, totpSecretEnc: sealed(secret) }),
    );

    const result = await securityService.confirm('user-1', totpCode(secret));

    expect(result.enabled).toBe(true);
    expect(result.backupCodes).toHaveLength(10);
    expect(repo.enableTotp).toHaveBeenCalledWith('user-1');
    // Backup codes are stored only as hashes (not the plaintext codes).
    expect(repo.replaceRecoveryCodes).toHaveBeenCalledTimes(1);
    const storedHashes = repo.replaceRecoveryCodes.mock.calls[0][1] as string[];
    expect(storedHashes).toHaveLength(10);
    for (const h of storedHashes) expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(result.backupCodes).not.toEqual(expect.arrayContaining(storedHashes));
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.TWO_FA_ENABLED }),
    );
  });

  it('rejects an invalid code and does not enable 2FA', async () => {
    const secret = generateTotpSecret();
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: false, totpSecretEnc: sealed(secret) }),
    );
    const valid = totpCode(secret);
    const wrong = valid === '000000' ? '000001' : '000000';

    await expect(securityService.confirm('user-1', wrong)).rejects.toMatchObject({
      errorCode: 'INVALID_TOTP',
    });
    expect(repo.enableTotp).not.toHaveBeenCalled();
  });

  it('requires setup before confirm', async () => {
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: false, totpSecretEnc: null }),
    );
    await expect(securityService.confirm('user-1', '123456')).rejects.toMatchObject({
      statusCode: 400,
      details: { code: 'TWO_FA_SETUP_REQUIRED' },
    });
  });
});

describe('verifySecondFactor (backup codes)', () => {
  it('accepts a one-time backup code and consumes it', async () => {
    const secret = generateTotpSecret();
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: true, totpSecretEnc: sealed(secret) }),
    );
    repo.consumeRecoveryCode.mockResolvedValueOnce(true);

    const result = await securityService.verifySecondFactor('user-1', 'ABCDE-FGHJK');
    expect(result).toEqual({ ok: true, method: 'backup_code' });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.BACKUP_CODE_USED }),
    );
  });

  it('rejects a backup code that has already been used (cannot be reused)', async () => {
    const secret = generateTotpSecret();
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: true, totpSecretEnc: sealed(secret) }),
    );
    repo.consumeRecoveryCode.mockResolvedValue(false); // already used

    const result = await securityService.verifySecondFactor('user-1', 'ABCDE-FGHJK');
    expect(result.ok).toBe(false);
  });

  it('locks out after too many failed second-factor attempts', async () => {
    redisGet.mockResolvedValueOnce('5'); // at the failure threshold
    await expect(
      securityService.verifySecondFactor('user-1', '000000'),
    ).rejects.toMatchObject({ errorCode: 'TWO_FA_LOCKED' });
  });
});

describe('disable', () => {
  it('rejects when the password is wrong (and does not disable)', async () => {
    const secret = generateTotpSecret();
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: true, passwordHash: pwHash, totpSecretEnc: sealed(secret) }),
    );

    await expect(
      securityService.disable('user-1', 'wrong-password', totpCode(secret)),
    ).rejects.toMatchObject({ errorCode: 'TWO_FA_DISABLE_REJECTED' });
    expect(repo.disableTotp).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.TWO_FA_DISABLE_FAILED }),
    );
  });

  it('disables 2FA with the correct password AND a current TOTP code', async () => {
    const secret = generateTotpSecret();
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: true, passwordHash: pwHash, totpSecretEnc: sealed(secret) }),
    );

    await securityService.disable('user-1', PASSWORD, totpCode(secret));

    expect(repo.disableTotp).toHaveBeenCalledWith('user-1');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.TWO_FA_DISABLED }),
    );
  });
});

describe('step-up', () => {
  it('issues a step-up token for a 2FA user with a valid code', async () => {
    const secret = generateTotpSecret();
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: true, totpSecretEnc: sealed(secret) }),
    );

    const result = await securityService.stepUp('user-1', { code: totpCode(secret) });
    expect(result.stepUpToken).toBeTruthy();
    expect(result.expiresInSeconds).toBeGreaterThan(0);
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:stepup:/),
      'user-1',
      'PX',
      expect.any(Number),
    );
  });

  it('uses password fallback for a user WITHOUT 2FA', async () => {
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: false, passwordHash: pwHash }),
    );
    const result = await securityService.stepUp('user-1', { password: PASSWORD });
    expect(result.stepUpToken).toBeTruthy();
  });

  it('rejects step-up when the password fallback is wrong (no 2FA)', async () => {
    repo.findUserById.mockResolvedValue(
      makeUser({ totpEnabled: false, passwordHash: pwHash }),
    );
    await expect(
      securityService.stepUp('user-1', { password: 'nope' }),
    ).rejects.toMatchObject({ errorCode: 'STEP_UP_REJECTED' });
    expect(redisSet).not.toHaveBeenCalledWith(
      expect.stringMatching(/^auth:stepup:/),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('validates a bound step-up token', async () => {
    redisGet.mockResolvedValueOnce('user-1');
    expect(await securityService.hasValidStepUp('user-1', 'sometoken')).toBe(true);
    redisGet.mockResolvedValueOnce('user-2');
    expect(await securityService.hasValidStepUp('user-1', 'sometoken')).toBe(false);
    expect(await securityService.hasValidStepUp('user-1', undefined)).toBe(false);
  });
});

describe('login challenge', () => {
  it('issues a hashed challenge token and redeems it for the user id', async () => {
    const token = await securityService.issueLoginChallenge('user-1');
    expect(token).toBeTruthy();
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:2fa:challenge:/),
      'user-1',
      'PX',
      expect.any(Number),
    );

    redisGetDel.mockResolvedValueOnce('user-1');
    expect(await securityService.consumeLoginChallenge(token)).toBe('user-1');
  });
});
