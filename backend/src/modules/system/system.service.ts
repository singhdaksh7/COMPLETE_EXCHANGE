import { Prisma } from '@prisma/client';
import { config } from '../../config';
import { getReadiness, type ReadinessReport } from '../health/health.service';
import { scannerService } from '../scanner/scanner.service';
import type { ScannerStatusSummary } from '../scanner/scanner.types';
import { systemRepository, type LargePendingWithdrawal } from './system.repository';

/**
 * Admin System / Ops Center service (Stage 4.3).
 *
 * Assembles SAFE operational snapshots for the admin observability console.
 *
 * Hard rule: nothing returned here may contain a secret. No DB/Redis/RPC URLs,
 * no SES credentials, no API keys, no private keys, no raw stack traces. Only
 * coarse operational data (statuses, counts, ids, amounts, provider MODES, and
 * safe boolean/mode config flags) crosses this boundary.
 */

// Windows for "stale"/"recent" risk heuristics.
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const DEPOSIT_STALE_MS = 6 * 60 * 60 * 1000; // 6h
const KYC_STALE_MS = 48 * 60 * 60 * 1000; // 48h

/** Extract just the domain from a MAIL_FROM value, never the local part. */
function senderDomain(from: string): string | null {
  const match = from.match(/@([^>\s]+)/);
  return match ? match[1].toLowerCase() : null;
}

export interface SystemHealth extends ReadinessReport {}

export interface SystemQueues {
  pendingInrDeposits: number;
  makerCheckerPendingDeposits: number;
  pendingWithdrawals: number;
  makerCheckerPendingWithdrawals: number;
  kycPending: number;
  kycNeedsMoreInfo: number;
  highRiskUsers: number;
  frozenUsers: number;
  withdrawalsBlockedUsers: number;
}

export interface SystemMail {
  provider: 'log' | 'ses';
  fromDomain: string | null;
  replyToConfigured: boolean;
  region: string | null;
  configurationSetConfigured: boolean;
  recentFailures: number;
  statusCounts: Record<string, number>;
  windowHours: number;
}

export interface SystemScanner extends ScannerStatusSummary {
  recentErrors: string[];
}

export interface SystemRiskAlerts {
  highRiskUsers: number;
  frozenUsers: number;
  lockedUsers: number;
  withdrawalsBlockedUsers: number;
  largePendingWithdrawals: {
    thresholdUsdt: string;
    count: number;
    items: LargePendingWithdrawal[];
  };
  failedRejectedWithdrawals: number;
  depositApprovalsPendingTooLong: number;
  kycPendingTooLong: number;
  repeatedMailFailures: number;
  failedLogins: number;
  windowHours: number;
}

export interface SystemFlags {
  mailProvider: 'log' | 'ses';
  withdrawalSigner: string;
  mockProvidersAllowed: boolean;
  mockWithdrawalSignerAllowed: boolean;
  logMailProviderAllowed: boolean;
  unverifiedEmailLoginAllowed: boolean;
  /** Stage 13 temporary login bypass (ALLOW_UNVERIFIED_LOGIN). Risk flag. */
  unverifiedLoginAllowed: boolean;
  adminTotpRequired: boolean;
  liveSigningEnabled: boolean;
}

export interface SystemOverview {
  status: 'ok' | 'degraded';
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  dependencies: ReadinessReport['dependencies'];
  summary: {
    pendingInrDeposits: number;
    pendingWithdrawals: number;
    kycPending: number;
    mailFailures: number;
  };
  scanner: { chains: Array<{ chain: string; providerMode: string; lastScannedBlock: string | null }> };
  mail: { provider: 'log' | 'ses'; fromDomain: string | null };
  risk: {
    highRiskUsers: number;
    frozenUsers: number;
    withdrawalsBlockedUsers: number;
    largePendingWithdrawals: number;
  };
  flags: SystemFlags;
  deployment: {
    version: string;
    environment: string;
    apiPrefix: string;
    adminApiPrefix: string;
  };
}

function buildFlags(): SystemFlags {
  return {
    mailProvider: config.mail.provider,
    withdrawalSigner: config.withdrawal.signer,
    mockProvidersAllowed: config.security.allowMockProviders,
    mockWithdrawalSignerAllowed: config.security.allowMockWithdrawalSigner,
    logMailProviderAllowed: config.security.allowLogMailProvider,
    unverifiedEmailLoginAllowed: config.security.allowUnverifiedEmailLogin,
    unverifiedLoginAllowed: config.auth.allowUnverifiedLogin,
    // TOTP is required unless the staging bypass flag is explicitly set.
    adminTotpRequired: !config.security.allowAdminLoginWithoutTotp,
    liveSigningEnabled: config.withdrawal.signer === 'live',
  };
}

export const systemService = {
  /** API/admin readiness — Postgres + Redis reachability + version/uptime. */
  health(): Promise<SystemHealth> {
    return getReadiness();
  },

  /** Operational queue depths across deposits, withdrawals, KYC and users. */
  async queues(): Promise<SystemQueues> {
    const [
      pendingInrDeposits,
      makerCheckerPendingDeposits,
      pendingWithdrawals,
      makerCheckerPendingWithdrawals,
      kycPending,
      kycNeedsMoreInfo,
      highRiskUsers,
      frozenUsers,
      withdrawalsBlockedUsers,
    ] = await Promise.all([
      systemRepository.countPendingManualInrDeposits(),
      systemRepository.countMakerCheckerPendingDeposits(),
      systemRepository.countPendingWithdrawals(),
      systemRepository.countMakerCheckerPendingWithdrawals(),
      systemRepository.countKycPending(),
      systemRepository.countKycNeedsMoreInfo(),
      systemRepository.countHighRiskUsers(),
      systemRepository.countFrozenUsers(),
      systemRepository.countWithdrawalsBlockedUsers(),
    ]);
    return {
      pendingInrDeposits,
      makerCheckerPendingDeposits,
      pendingWithdrawals,
      makerCheckerPendingWithdrawals,
      kycPending,
      kycNeedsMoreInfo,
      highRiskUsers,
      frozenUsers,
      withdrawalsBlockedUsers,
    };
  },

  /** Scanner checkpoints + provider MODES (secrets-free; reuses scannerService). */
  async scanner(): Promise<SystemScanner> {
    const summary = await scannerService.statusSummary();
    // We do not persist a scanner-error log table; expose an empty, stable shape
    // so the UI can render the section without leaking anything.
    return { ...summary, recentErrors: [] };
  },

  /** Mail provider posture + coarse delivery counts. Never exposes credentials. */
  async mail(): Promise<SystemMail> {
    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const statusCounts =
      await systemRepository.notificationEmailStatusCountsSince(since);
    return {
      provider: config.mail.provider,
      fromDomain: senderDomain(config.mail.from),
      replyToConfigured: Boolean(config.mail.replyTo),
      // Region identifies WHERE SES runs; it is not a secret. Credentials are
      // resolved from the AWS provider chain and are never read or returned.
      region: config.mail.awsRegion ?? null,
      configurationSetConfigured: Boolean(config.mail.sesConfigurationSet),
      recentFailures: statusCounts.FAILED ?? 0,
      statusCounts,
      windowHours: RECENT_WINDOW_MS / 3_600_000,
    };
  },

  /** Risk alerts: large/failed withdrawals, stale queues, auth pressure. */
  async riskAlerts(): Promise<SystemRiskAlerts> {
    const now = Date.now();
    const recentSince = new Date(now - RECENT_WINDOW_MS);
    const depositBefore = new Date(now - DEPOSIT_STALE_MS);
    const kycBefore = new Date(now - KYC_STALE_MS);
    const threshold = new Prisma.Decimal(config.withdrawal.dualApprovalThreshold);

    const [
      highRiskUsers,
      frozenUsers,
      lockedUsers,
      withdrawalsBlockedUsers,
      large,
      failedRejectedWithdrawals,
      depositApprovalsPendingTooLong,
      kycPendingTooLong,
      mailStatusCounts,
      failedLogins,
    ] = await Promise.all([
      systemRepository.countHighRiskUsers(),
      systemRepository.countFrozenUsers(),
      systemRepository.countLockedUsers(),
      systemRepository.countWithdrawalsBlockedUsers(),
      systemRepository.largePendingWithdrawals(threshold, 10),
      systemRepository.countFailedRejectedWithdrawalsSince(recentSince),
      systemRepository.countDepositApprovalsPendingSince(depositBefore),
      systemRepository.countKycPendingSince(kycBefore),
      systemRepository.notificationEmailStatusCountsSince(recentSince),
      systemRepository.countFailedLoginsSince(recentSince),
    ]);

    return {
      highRiskUsers,
      frozenUsers,
      lockedUsers,
      withdrawalsBlockedUsers,
      largePendingWithdrawals: {
        thresholdUsdt: threshold.toFixed(),
        count: large.count,
        items: large.items,
      },
      failedRejectedWithdrawals,
      depositApprovalsPendingTooLong,
      kycPendingTooLong,
      repeatedMailFailures: mailStatusCounts.FAILED ?? 0,
      failedLogins,
      windowHours: RECENT_WINDOW_MS / 3_600_000,
    };
  },

  /** Single high-level snapshot powering the Ops Center summary cards + flags. */
  async overview(): Promise<SystemOverview> {
    const [readiness, queues, scanner, mail, risk] = await Promise.all([
      getReadiness(),
      this.queues(),
      this.scanner(),
      this.mail(),
      this.riskAlerts(),
    ]);

    return {
      status: readiness.status,
      version: readiness.version,
      environment: readiness.environment,
      uptime: readiness.uptime,
      timestamp: readiness.timestamp,
      dependencies: readiness.dependencies,
      summary: {
        pendingInrDeposits: queues.pendingInrDeposits,
        pendingWithdrawals: queues.pendingWithdrawals,
        kycPending: queues.kycPending,
        mailFailures: mail.recentFailures,
      },
      scanner: {
        chains: scanner.chains.map((c) => ({
          chain: c.chain,
          providerMode: c.providerMode,
          lastScannedBlock: c.lastScannedBlock,
        })),
      },
      mail: { provider: mail.provider, fromDomain: mail.fromDomain },
      risk: {
        highRiskUsers: risk.highRiskUsers,
        frozenUsers: risk.frozenUsers,
        withdrawalsBlockedUsers: risk.withdrawalsBlockedUsers,
        largePendingWithdrawals: risk.largePendingWithdrawals.count,
      },
      flags: buildFlags(),
      deployment: {
        version: readiness.version,
        environment: readiness.environment,
        apiPrefix: config.http.apiPrefix,
        adminApiPrefix: config.admin.apiPrefix,
      },
    };
  },
};

export type SystemService = typeof systemService;
