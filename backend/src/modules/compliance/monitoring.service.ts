import type { ComplianceAlert, Prisma } from '@prisma/client';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { recordAudit } from '../../lib/audit';
import { complianceService } from './compliance.service';
import { monitoringRepository } from './monitoring.repository';
import {
  dayBucket,
  evaluateRules,
  type AlertCandidate,
  type MonitoringConfig,
  type MonitoringSnapshot,
} from './monitoring.rules';
import type { ComplianceContext } from './compliance.types';

/**
 * Suspicious-transaction monitoring service (Stage 5.2).
 *
 * Orchestrates: read activity -> run the pure rule engine -> idempotently
 * persist alerts -> auto-open a SUSPICIOUS_TRANSACTION case for HIGH/CRITICAL
 * findings (one per user per UTC day) and link them -> emit a case event +
 * admin audit signal -> recompute risk.
 *
 * SAFETY: this service is DETECTION-ONLY. It reads deposits / withdrawals /
 * trades / inr_transactions but never mutates them, never touches the ledger,
 * scanner, matching engine, or withdrawal signing, and never blocks trading or
 * withdrawals. It writes only to the four new compliance-monitoring tables plus
 * the additive risk_assessments / audit_logs. It is fail-safe: a failure for one
 * user is logged and never aborts the sweep.
 */

function monitoringCfg(): MonitoringConfig {
  const m = config.compliance.monitoring;
  return {
    lookbackDays: m.lookbackDays,
    highValueWithdrawal: m.highValueWithdrawal,
    failedWithdrawalCount: m.failedWithdrawalCount,
    rapidWindowMinutes: m.rapidWindowMinutes,
    structuringBand: m.structuringBand,
    structuringCount: m.structuringCount,
    abnormalTradingVolume: m.abnormalTradingVolume,
  };
}

export interface MonitoringRunResult {
  usersEvaluated: number;
  alertsCreated: number;
  alertsExisting: number;
  casesCreated: number;
  alertsLinked: number;
}

const HIGH_OR_CRITICAL = (p: AlertCandidate['priority']): boolean =>
  p === 'HIGH' || p === 'CRITICAL';

export const monitoringService = {
  /** Run monitoring for a single user. Pure-safe: never throws. */
  async runForUser(
    userId: string,
    ctx: ComplianceContext & { system?: boolean } = {},
    result?: MonitoringRunResult,
  ): Promise<MonitoringRunResult> {
    const acc: MonitoringRunResult =
      result ?? { usersEvaluated: 0, alertsCreated: 0, alertsExisting: 0, casesCreated: 0, alertsLinked: 0 };
    const cfg = monitoringCfg();
    const now = new Date();
    const since = new Date(now.getTime() - cfg.lookbackDays * 24 * 60 * 60 * 1000);

    try {
      const [activity, signals] = await Promise.all([
        monitoringRepository.loadActivity(userId, since),
        monitoringRepository.findProfileSignals(userId),
      ]);

      const snapshot: MonitoringSnapshot = {
        userId,
        withdrawals: activity.withdrawals,
        deposits: activity.deposits,
        trades: activity.trades,
        riskLevel: signals?.riskLevel ?? null,
        sanctionsStatus: signals?.sanctionsStatus ?? null,
        pepStatus: signals?.pepStatus ?? null,
        adverseMediaStatus: signals?.adverseMediaStatus ?? null,
        now,
      };

      const candidates = evaluateRules(snapshot, cfg);
      acc.usersEvaluated += 1;
      if (candidates.length === 0) return acc;

      const newHighAlerts: ComplianceAlert[] = [];
      for (const c of candidates) {
        const { alert, created } = await monitoringRepository.upsertAlert({
          userId,
          type: c.type,
          status: 'OPEN',
          priority: c.priority,
          score: c.score,
          title: c.title,
          description: c.description,
          dedupeKey: c.dedupeKey,
          details: c.details as Prisma.InputJsonValue,
        });
        if (created) acc.alertsCreated += 1;
        else acc.alertsExisting += 1;
        // Only newly-created HIGH/CRITICAL alerts drive auto-case creation; this
        // keeps the run idempotent (re-running links nothing new).
        if (created && HIGH_OR_CRITICAL(c.priority) && alert.caseId === null) {
          newHighAlerts.push(alert);
        }
      }

      if (newHighAlerts.length > 0) {
        await this.attachToAutoCase(userId, newHighAlerts, now, ctx, acc);
      }

      // Recompute risk so an open HIGH/CRITICAL case feeds the user's score.
      // No-op (caught) when the user has no compliance profile yet.
      await this.safeRecomputeRisk(userId, ctx);
    } catch (err) {
      logger.error({ err, userId }, 'monitoring: runForUser failed (non-fatal)');
    }
    return acc;
  },

  /**
   * Idempotently find-or-create the user's auto case for today (UTC day) and
   * link the given HIGH/CRITICAL alerts to it. Emits a CASE_CREATED event +
   * admin audit signal on first creation.
   */
  async attachToAutoCase(
    userId: string,
    alerts: ComplianceAlert[],
    now: Date,
    ctx: ComplianceContext & { system?: boolean },
    acc: MonitoringRunResult,
  ): Promise<void> {
    const dedupeKey = `AUTOCASE:${userId}:${dayBucket(now)}`;
    const topPriority = alerts.some((a) => a.priority === 'CRITICAL') ? 'CRITICAL' : 'HIGH';

    let theCase = await monitoringRepository.findCaseByDedupe(dedupeKey);
    let createdCase = false;
    if (!theCase) {
      theCase = await monitoringRepository.createCase({
        userId,
        type: 'SUSPICIOUS_TRANSACTION',
        status: 'OPEN',
        priority: topPriority,
        title: 'Auto: suspicious transaction activity',
        summary: `Auto-opened from ${alerts.length} HIGH/CRITICAL monitoring alert(s) on ${dayBucket(now)}.`,
        dedupeKey,
        openedByAdminId: null, // system/auto
      });
      createdCase = true;
      acc.casesCreated += 1;
      await monitoringRepository.createEvent({
        caseId: theCase.id,
        action: 'CASE_CREATED',
        actorAdminId: null,
        metadata: { auto: true, priority: topPriority, dedupeKey } as Prisma.InputJsonValue,
      });
      await this.notifyAdminsCaseOpened(theCase.id, userId, topPriority, ctx);
    }

    for (const a of alerts) {
      await monitoringRepository.updateAlert(a.id, {
        caseId: theCase.id,
        status: 'LINKED_TO_CASE',
      });
      acc.alertsLinked += 1;
      await monitoringRepository.createEvent({
        caseId: theCase.id,
        action: 'ALERT_LINKED',
        actorAdminId: null,
        metadata: { alertId: a.id, type: a.type, auto: true } as Prisma.InputJsonValue,
      });
    }

    // Keep the case priority at the strongest linked alert.
    if (!createdCase && topPriority === 'CRITICAL' && theCase.priority !== 'CRITICAL') {
      await monitoringRepository.updateCase(theCase.id, { priority: 'CRITICAL' });
    }
  },

  /**
   * Admin notification for a HIGH/CRITICAL case (Stage 5.2 decision): we reuse
   * the admin-visible AUDIT channel + dashboard counts. We deliberately DO NOT
   * use the user Notification table and never email the subject user (tipping-off
   * risk for STR-eligible activity).
   */
  async notifyAdminsCaseOpened(
    caseId: string,
    userId: string,
    priority: string,
    ctx: ComplianceContext,
  ): Promise<void> {
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.case.opened',
      entityType: 'compliance_case',
      entityId: caseId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { userId, priority, channel: 'admin-audit' } as Prisma.InputJsonValue,
    });
  },

  /** Recompute risk only when a compliance profile exists; never throws. */
  async safeRecomputeRisk(userId: string, ctx: ComplianceContext & { system?: boolean }): Promise<void> {
    try {
      const signals = await monitoringRepository.findProfileSignals(userId);
      if (!signals) return; // no profile -> nothing to recompute
      await complianceService.recomputeRisk(userId, 'TRANSACTION', {
        createdByAdminId: ctx.system ? undefined : ctx.actorId,
      });
    } catch (err) {
      logger.warn({ err, userId }, 'monitoring: risk recompute failed (non-fatal)');
    }
  },

  /** Run a full sweep across users with recent activity. */
  async runAll(ctx: ComplianceContext & { system?: boolean } = {}): Promise<MonitoringRunResult> {
    const cfg = monitoringCfg();
    const since = new Date(Date.now() - cfg.lookbackDays * 24 * 60 * 60 * 1000);
    const userIds = await monitoringRepository.usersWithRecentActivity(since);
    const acc: MonitoringRunResult = {
      usersEvaluated: 0,
      alertsCreated: 0,
      alertsExisting: 0,
      casesCreated: 0,
      alertsLinked: 0,
    };
    for (const userId of userIds) {
      await this.runForUser(userId, ctx, acc);
    }
    return acc;
  },

  /**
   * Admin-triggered run. With a userId, scopes to that user; otherwise sweeps.
   * Records an audit entry for the run itself.
   */
  async run(
    ctx: ComplianceContext & { system?: boolean } = {},
    userId?: string,
  ): Promise<MonitoringRunResult> {
    const result = userId
      ? await this.runForUser(userId, ctx)
      : await this.runAll(ctx);
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.monitoring.run',
      entityType: userId ? 'user' : undefined,
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { scope: userId ? 'user' : 'all', ...result } as Prisma.InputJsonValue,
    });
    return result;
  },
};

export type MonitoringService = typeof monitoringService;
