import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the IO boundaries; the service composition logic itself is exercised for real.
vi.mock('../../src/modules/system/system.repository', () => ({
  systemRepository: {
    countPendingManualInrDeposits: vi.fn(),
    countMakerCheckerPendingDeposits: vi.fn(),
    countPendingWithdrawals: vi.fn(),
    countMakerCheckerPendingWithdrawals: vi.fn(),
    countKycPending: vi.fn(),
    countKycNeedsMoreInfo: vi.fn(),
    countHighRiskUsers: vi.fn(),
    countFrozenUsers: vi.fn(),
    countLockedUsers: vi.fn(),
    countWithdrawalsBlockedUsers: vi.fn(),
    countFailedRejectedWithdrawalsSince: vi.fn(),
    countDepositApprovalsPendingSince: vi.fn(),
    countKycPendingSince: vi.fn(),
    countFailedLoginsSince: vi.fn(),
    largePendingWithdrawals: vi.fn(),
    notificationEmailStatusCountsSince: vi.fn(),
  },
}));

vi.mock('../../src/modules/health/health.service', () => ({
  getReadiness: vi.fn(),
}));

vi.mock('../../src/modules/scanner/scanner.service', () => ({
  scannerService: { statusSummary: vi.fn() },
}));

import { systemService } from '../../src/modules/system/system.service';
import { systemRepository } from '../../src/modules/system/system.repository';
import { getReadiness } from '../../src/modules/health/health.service';
import { scannerService } from '../../src/modules/scanner/scanner.service';
import { config } from '../../src/config';

const repo = vi.mocked(systemRepository);
const readiness = vi.mocked(getReadiness);
const scanner = vi.mocked(scannerService);

const READINESS = {
  status: 'ok' as const,
  service: 'cex-backend',
  version: '0.1.0',
  environment: 'test',
  uptime: 123,
  timestamp: '2026-06-21T00:00:00.000Z',
  dependencies: { database: 'ok' as const, redis: 'ok' as const },
};

const SCANNER_SUMMARY = {
  safetyLag: 20,
  reorgBuffer: 6,
  startBlock: 100n.toString() as unknown as bigint, // value unused by assertions
  chains: [
    {
      chain: 'TRON',
      providerMode: 'mock',
      lastScannedBlock: '5000',
      safeBlock: '4980',
      lastScannedHash: '0xabc',
      updatedAt: new Date('2026-06-21T00:00:00.000Z'),
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  readiness.mockResolvedValue(READINESS);
  scanner.statusSummary.mockResolvedValue(SCANNER_SUMMARY as never);

  repo.countPendingManualInrDeposits.mockResolvedValue(3);
  repo.countMakerCheckerPendingDeposits.mockResolvedValue(1);
  repo.countPendingWithdrawals.mockResolvedValue(4);
  repo.countMakerCheckerPendingWithdrawals.mockResolvedValue(2);
  repo.countKycPending.mockResolvedValue(7);
  repo.countKycNeedsMoreInfo.mockResolvedValue(2);
  repo.countHighRiskUsers.mockResolvedValue(5);
  repo.countFrozenUsers.mockResolvedValue(1);
  repo.countLockedUsers.mockResolvedValue(0);
  repo.countWithdrawalsBlockedUsers.mockResolvedValue(2);
  repo.countFailedRejectedWithdrawalsSince.mockResolvedValue(6);
  repo.countDepositApprovalsPendingSince.mockResolvedValue(1);
  repo.countKycPendingSince.mockResolvedValue(3);
  repo.countFailedLoginsSince.mockResolvedValue(42);
  repo.largePendingWithdrawals.mockResolvedValue({
    count: 2,
    items: [
      {
        id: 'wd-1',
        userId: 'user-1',
        asset: 'USDT',
        chain: 'TRON',
        amount: '5000',
        status: 'PENDING_APPROVAL',
        requestedAt: new Date('2026-06-20T00:00:00.000Z'),
      },
    ],
  });
  repo.notificationEmailStatusCountsSince.mockResolvedValue({
    SENT: 100,
    LOGGED: 5,
    FAILED: 4,
  });
});

describe('systemService.queues', () => {
  it('returns the full set of operational queue counts', async () => {
    const q = await systemService.queues();
    expect(q).toEqual({
      pendingInrDeposits: 3,
      makerCheckerPendingDeposits: 1,
      pendingWithdrawals: 4,
      makerCheckerPendingWithdrawals: 2,
      kycPending: 7,
      kycNeedsMoreInfo: 2,
      highRiskUsers: 5,
      frozenUsers: 1,
      withdrawalsBlockedUsers: 2,
    });
  });
});

describe('systemService.scanner', () => {
  it('includes the scanner summary and a safe recentErrors array', async () => {
    const s = await systemService.scanner();
    expect(s.chains[0]).toMatchObject({ chain: 'TRON', providerMode: 'mock' });
    expect(s.safetyLag).toBe(20);
    expect(s.reorgBuffer).toBe(6);
    expect(s.recentErrors).toEqual([]);
  });
});

describe('systemService.mail', () => {
  it('reports provider + sender DOMAIN only and never exposes credentials', async () => {
    const m = await systemService.mail();
    expect(m.provider).toBe(config.mail.provider);
    // test env default MAIL_FROM is "Exora <no-reply@exora.local>"
    expect(m.fromDomain).toBe('exora.local');
    // No full address / local part leaks.
    expect(m.fromDomain).not.toContain('no-reply');
    expect(m.recentFailures).toBe(4);
    expect(m.statusCounts).toMatchObject({ SENT: 100, FAILED: 4 });
    // The mail status object must not carry any credential-ish key.
    const keys = Object.keys(m);
    expect(keys).not.toContain('secret');
    expect(keys).not.toContain('accessKeyId');
    expect(keys).not.toContain('credentials');
  });
});

describe('systemService.riskAlerts', () => {
  it('summarises risk signals using the configured withdrawal threshold', async () => {
    const r = await systemService.riskAlerts();
    expect(r.highRiskUsers).toBe(5);
    expect(r.frozenUsers).toBe(1);
    expect(r.withdrawalsBlockedUsers).toBe(2);
    expect(r.failedRejectedWithdrawals).toBe(6);
    expect(r.depositApprovalsPendingTooLong).toBe(1);
    expect(r.kycPendingTooLong).toBe(3);
    expect(r.repeatedMailFailures).toBe(4);
    expect(r.failedLogins).toBe(42);
    expect(r.largePendingWithdrawals.count).toBe(2);
    expect(r.largePendingWithdrawals.thresholdUsdt).toBe(
      config.withdrawal.dualApprovalThreshold,
    );
    expect(r.largePendingWithdrawals.items[0]).toMatchObject({ id: 'wd-1', asset: 'USDT' });
  });
});

describe('systemService.overview', () => {
  it('returns the expected safe shape with summary cards and flags', async () => {
    const o = await systemService.overview();
    expect(o.status).toBe('ok');
    expect(o.dependencies).toEqual({ database: 'ok', redis: 'ok' });
    expect(o.summary).toEqual({
      pendingInrDeposits: 3,
      pendingWithdrawals: 4,
      kycPending: 7,
      mailFailures: 4,
    });
    expect(o.flags).toMatchObject({
      mailProvider: config.mail.provider,
      withdrawalSigner: config.withdrawal.signer,
      adminTotpRequired: !config.security.allowAdminLoginWithoutTotp,
      liveSigningEnabled: config.withdrawal.signer === 'live',
    });
    expect(o.deployment).toMatchObject({
      apiPrefix: config.http.apiPrefix,
      adminApiPrefix: config.admin.apiPrefix,
    });
  });

  it('NEVER leaks secrets (db/redis/jwt) anywhere in the serialized response', async () => {
    const serialized = JSON.stringify(await systemService.overview());

    // Known sensitive values from the validated test config.
    const secrets = [
      config.db.url,
      config.redis.url,
      config.jwt.accessSecret,
      config.jwt.refreshSecret,
      'cex_password', // embedded in the test DATABASE_URL
    ];
    for (const secret of secrets) {
      if (secret) expect(serialized).not.toContain(secret);
    }
    // And no obvious secret-y key names surface.
    expect(serialized).not.toMatch(/databaseUrl|redisUrl|"url"|accessSecret|privateKey|apiKey/i);
  });
});
