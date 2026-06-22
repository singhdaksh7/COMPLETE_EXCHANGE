import type {
  Prisma,
  WalletRiskCheck,
  WalletRiskLevel,
  WalletRiskStatus,
} from '@prisma/client';
import { logger } from '../../lib/logger';
import { recordAudit } from '../../lib/audit';
import { NotFoundError } from '../../lib/errors';
import { getWalletRiskProvider } from './wallet-risk';
import { walletRiskRepository } from './wallet-risk.repository';
import { monitoringRepository } from './monitoring.repository';
import { dayBucket } from './monitoring.rules';
import type { ComplianceContext } from './compliance.types';

/**
 * Wallet-risk service (Stage 5.3).
 *
 * Runs the pluggable (mock) wallet-risk provider, persists checks idempotently,
 * maintains a per-address risk profile, and — for HIGH/CRITICAL results tied to a
 * known user — raises a Stage 5.2 ComplianceAlert and (for CRITICAL/BLOCKED)
 * auto-opens a WALLET_RISK ComplianceCase, reusing the existing case workflow.
 *
 * SAFETY: detection-only. It reads/writes only the wallet-risk tables plus the
 * additive compliance alert/case + audit tables. It NEVER mutates the ledger,
 * scanner, matching engine, or withdrawal signing, and never blocks money
 * movement. The withdrawal-compliance evaluation below is a PURE foundation that
 * the withdrawal flow does not yet call.
 */

const HIGH_OR_CRITICAL = (l: WalletRiskLevel): boolean => l === 'HIGH' || l === 'CRITICAL';

export interface RunWalletRiskInput {
  chain: string;
  address: string;
  userId?: string | null;
  direction?: 'INBOUND' | 'OUTBOUND' | null;
  withdrawalId?: string | null;
  depositId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Pure foundation: withdrawal compliance decision (NOT yet wired in). */
/* ------------------------------------------------------------------ */

export type WithdrawalComplianceDecision = 'ALLOW' | 'HOLD_FOR_REVIEW' | 'HOLD_FOR_TRAVEL_RULE';

export interface WithdrawalComplianceResult {
  decision: WithdrawalComplianceDecision;
  requiresReview: boolean;
  reasons: string[];
}

/**
 * Pure decision helper for a withdrawal given its wallet-risk + Travel Rule
 * posture. This is the Stage 5.3 FOUNDATION: it is fully unit-tested but is NOT
 * called from the live withdrawal request/signing path, so existing withdrawal
 * behaviour is unchanged. Wiring it as an active gate is a later, deliberate step.
 */
export function evaluateWithdrawalCompliance(input: {
  walletRiskStatus: WalletRiskStatus | null;
  travelRuleStatus:
    | 'NOT_REQUIRED'
    | 'REQUIRED'
    | 'PENDING_INFO'
    | 'READY'
    | 'SENT_MOCK'
    | 'FAILED'
    | 'EXEMPTED'
    | null;
}): WithdrawalComplianceResult {
  const reasons: string[] = [];

  // BLOCKED / (CRITICAL→BLOCKED) wallet risk must go to compliance review first.
  if (input.walletRiskStatus === 'BLOCKED') {
    reasons.push('WALLET_RISK_BLOCKED');
    return { decision: 'HOLD_FOR_REVIEW', requiresReview: true, reasons };
  }
  if (input.walletRiskStatus === 'REVIEW_REQUIRED') {
    reasons.push('WALLET_RISK_REVIEW_REQUIRED');
    return { decision: 'HOLD_FOR_REVIEW', requiresReview: true, reasons };
  }

  // Travel Rule data must be collected/ready before an over-threshold transfer.
  if (input.travelRuleStatus === 'REQUIRED' || input.travelRuleStatus === 'PENDING_INFO') {
    reasons.push('TRAVEL_RULE_INFO_REQUIRED');
    return { decision: 'HOLD_FOR_TRAVEL_RULE', requiresReview: false, reasons };
  }

  return { decision: 'ALLOW', requiresReview: false, reasons };
}

/* ------------------------------------------------------------------ */
/* Service                                                            */
/* ------------------------------------------------------------------ */

export const walletRiskService = {
  /**
   * Run the (mock) wallet-risk provider for an address. Idempotent per
   * address+UTC-day via `dedupeKey`: a repeat run returns the existing check
   * without re-raising alerts/cases. A provider throw is recorded as a FAILED
   * check and never propagates as a money-movement block.
   */
  async runCheck(input: RunWalletRiskInput, ctx: ComplianceContext = {}) {
    const provider = getWalletRiskProvider();
    const chain = input.chain;
    const address = input.address;
    const day = dayBucket(new Date());
    const dedupeKey = `WALLETRISK:${chain}:${address}:${day}`;

    let level: WalletRiskLevel = 'LOW';
    let status: WalletRiskStatus = 'CLEAR';
    let score = 0;
    let summary = '';
    let categories: string[] = [];
    let providerName = provider.name;
    let providerMode = provider.mode;

    try {
      const res = await provider.screen({ chain, address, direction: input.direction ?? null });
      level = res.level;
      status = res.status;
      score = res.score;
      summary = res.summary;
      categories = res.categories;
      providerName = res.provider;
      providerMode = res.mode;
    } catch (err) {
      // Provider failure -> FAILED check. Never throws to a money-movement path.
      logger.warn({ err, chain, address }, 'wallet-risk: provider failed (recorded as FAILED)');
      level = 'MEDIUM';
      status = 'FAILED';
      score = 0;
      summary = 'Wallet-risk provider failed; manual re-check required.';
      categories = ['provider_error'];
    }

    // Ensure the profile exists / refresh its posture.
    const existingProfile = await walletRiskRepository.findProfile(chain, address);
    const profile = await walletRiskRepository.upsertProfile(
      chain,
      address,
      {
        chain,
        address,
        level,
        status,
        score,
        checkCount: 1,
        categories: categories as unknown as Prisma.InputJsonValue,
        lastScreenedAt: new Date(),
      },
      {
        // Don't override an admin-pinned level; otherwise track the latest.
        ...(existingProfile?.overriddenLevel ? {} : { level, status, score }),
        categories: categories as unknown as Prisma.InputJsonValue,
        checkCount: { increment: 1 },
        lastScreenedAt: new Date(),
      },
    );

    const { check, created } = await walletRiskRepository.upsertCheck({
      profileId: profile.id,
      userId: input.userId ?? null,
      chain,
      address,
      direction: input.direction ?? null,
      level,
      status,
      provider: providerName,
      providerMode,
      score,
      summary,
      categories: categories as unknown as Prisma.InputJsonValue,
      dedupeKey,
      withdrawalId: input.withdrawalId ?? null,
      depositId: input.depositId ?? null,
    });

    await walletRiskRepository.updateProfile(profile.id, { lastCheckId: check.id });
    await walletRiskRepository.createEvent({
      profileId: profile.id,
      action: created ? 'SCREENED' : 'SCREENED_DUPLICATE',
      actorAdminId: ctx.actorId ?? null,
      metadata: { checkId: check.id, level, status, score } as Prisma.InputJsonValue,
    });

    // Only newly-created HIGH/CRITICAL checks for a KNOWN user raise alerts/cases
    // (keeps re-runs idempotent; alert/case require a non-null user).
    if (created && HIGH_OR_CRITICAL(level) && input.userId) {
      await this.raiseAlertAndCase(check, input.userId, chain, address, level, day);
    }

    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.wallet_risk.run',
      entityType: 'wallet_risk_check',
      entityId: check.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { chain, address, level, status, created } as Prisma.InputJsonValue,
    });

    return { check, profileId: profile.id, created };
  },

  /**
   * Raise a Stage 5.2 ComplianceAlert for a HIGH/CRITICAL check and, for
   * CRITICAL, auto-open/link a WALLET_RISK case (one per user+address+UTC-day).
   * Reuses the existing alert/case tables — no parallel workflow.
   */
  async raiseAlertAndCase(
    check: WalletRiskCheck,
    userId: string,
    chain: string,
    address: string,
    level: WalletRiskLevel,
    day: string,
  ): Promise<void> {
    const priority = level === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
    const { alert } = await monitoringRepository.upsertAlert({
      userId,
      type: 'WALLET_RISK_ACTIVITY',
      status: 'OPEN',
      priority,
      score: check.score,
      title: `Wallet risk: ${level} on ${chain} address`,
      description: check.summary,
      dedupeKey: `WALLETRISK_ALERT:${chain}:${address}:${day}`,
      details: { walletRiskCheckId: check.id, chain, address, level } as Prisma.InputJsonValue,
    });

    let caseId: string | null = null;
    if (level === 'CRITICAL') {
      const caseDedupe = `WALLETRISK_CASE:${userId}:${day}`;
      let theCase = await monitoringRepository.findCaseByDedupe(caseDedupe);
      if (!theCase) {
        theCase = await monitoringRepository.createCase({
          userId,
          type: 'WALLET_RISK',
          status: 'OPEN',
          priority: 'CRITICAL',
          title: 'Auto: critical wallet-risk address',
          summary: `Auto-opened from a CRITICAL wallet-risk check on ${chain} ${address}.`,
          dedupeKey: caseDedupe,
          openedByAdminId: null,
        });
        await monitoringRepository.createEvent({
          caseId: theCase.id,
          action: 'CASE_CREATED',
          actorAdminId: null,
          metadata: { auto: true, source: 'wallet_risk', priority: 'CRITICAL' } as Prisma.InputJsonValue,
        });
        // Admin notification via the audit channel (Stage 5.2 decision).
        await recordAudit({
          actorType: 'SYSTEM',
          action: 'compliance.case.opened',
          entityType: 'compliance_case',
          entityId: theCase.id,
          metadata: { userId, priority: 'CRITICAL', source: 'wallet_risk' } as Prisma.InputJsonValue,
        });
      }
      caseId = theCase.id;
      await monitoringRepository.updateAlert(alert.id, { caseId, status: 'LINKED_TO_CASE' });
      await monitoringRepository.createEvent({
        caseId,
        action: 'ALERT_LINKED',
        actorAdminId: null,
        metadata: { alertId: alert.id, source: 'wallet_risk', auto: true } as Prisma.InputJsonValue,
      });
    }

    await walletRiskRepository.updateCheck(check.id, { alertId: alert.id, caseId });
  },

  /** Admin: override / review a wallet-risk check (and pin the profile level). */
  async review(
    checkId: string,
    input: { decision: WalletRiskStatus; level?: WalletRiskLevel; note?: string },
    ctx: ComplianceContext = {},
  ) {
    const check = await walletRiskRepository.findCheck(checkId);
    if (!check) throw new NotFoundError('Wallet-risk check not found');

    const updated = await walletRiskRepository.updateCheck(checkId, {
      status: input.decision,
      reviewDecision: input.decision,
      reviewNote: input.note ?? null,
      reviewedByAdminId: ctx.actorId ?? null,
      reviewedAt: new Date(),
      ...(input.level ? { level: input.level } : {}),
    });

    if (check.profileId) {
      await walletRiskRepository.updateProfile(check.profileId, {
        status: input.decision,
        ...(input.level
          ? { overriddenLevel: input.level, overriddenByAdminId: ctx.actorId ?? null, level: input.level }
          : {}),
        ...(input.note ? { notes: input.note } : {}),
      });
      await walletRiskRepository.createEvent({
        profileId: check.profileId,
        action: 'REVIEWED',
        actorAdminId: ctx.actorId ?? null,
        metadata: { checkId, decision: input.decision, level: input.level ?? null } as Prisma.InputJsonValue,
      });
    }

    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.wallet_risk.review',
      entityType: 'wallet_risk_check',
      entityId: checkId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { decision: input.decision, level: input.level ?? null } as Prisma.InputJsonValue,
    });

    return updated;
  },

  async listChecks(input: Parameters<typeof walletRiskRepository.listChecks>[0]) {
    const rows = await walletRiskRepository.listChecks(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },

  async listProfiles(input: Parameters<typeof walletRiskRepository.listProfiles>[0]) {
    const rows = await walletRiskRepository.listProfiles(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },

  async getProfile(id: string) {
    const profile = await walletRiskRepository.findProfileById(id);
    if (!profile) throw new NotFoundError('Wallet-risk profile not found');
    return profile;
  },

  summary: () => walletRiskRepository.summary(),
};

export type WalletRiskService = typeof walletRiskService;
