import type {
  ComplianceAlertStatus,
  ComplianceCaseStatus,
  Prisma,
} from '@prisma/client';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { recordAudit } from '../../lib/audit';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { complianceRepository } from './compliance.repository';
import { complianceService } from './compliance.service';
import { monitoringRepository } from './monitoring.repository';
import { buildScreeningView } from './screening.service';
import { toAdminComplianceDto, toRiskAssessmentDto } from './compliance.types';
import type { ComplianceContext } from './compliance.types';
import {
  toAlertDto,
  toCaseDetailDto,
  toCaseListDto,
  type StrDraftExport,
} from './case.types';
import type {
  CaseCreateDto,
  CaseListQueryDto,
} from './case.validators';

/**
 * Compliance case workflow service (Stage 5.2).
 *
 * Owns the manual/admin side of the STR case lifecycle: list, detail, create,
 * assign, status, notes, alert linking + alert status, and the STR DRAFT export.
 * Every mutation writes an append-only ComplianceCaseEvent and an admin audit
 * entry. Closing a case (or dismissing its driving alerts) recomputes risk so a
 * resolved case stops contributing to the user's score.
 *
 * It never mutates money-movement tables; it READS them only to enumerate the
 * linked transactions for the STR draft.
 */

export const caseService = {
  // ==================================================================
  // Cases
  // ==================================================================
  async list(input: CaseListQueryDto, ctx: ComplianceContext = {}) {
    const rows = await monitoringRepository.listCases(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    await this.audit(ctx, 'compliance.case.list', undefined, { count: page.length });
    return {
      items: page.map(toCaseListDto),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  async get(caseId: string, ctx: ComplianceContext = {}) {
    const found = await monitoringRepository.findCase(caseId);
    if (!found) throw new NotFoundError('Compliance case not found');
    await this.audit(ctx, 'compliance.case.view', caseId, {});
    return toCaseDetailDto(found);
  },

  async summary(ctx: ComplianceContext = {}) {
    const s = await monitoringRepository.summary();
    await this.audit(ctx, 'compliance.case.summary', undefined, {});
    return s;
  },

  async create(input: CaseCreateDto, ctx: ComplianceContext = {}) {
    const user = await complianceRepository.findUserBasic(input.userId);
    if (!user) throw new NotFoundError('User not found');

    const created = await monitoringRepository.createCase({
      userId: input.userId,
      type: input.type,
      status: 'OPEN',
      priority: input.priority,
      title: input.title,
      summary: input.summary ?? null,
      openedByAdminId: ctx.actorId ?? null,
    });

    await monitoringRepository.createEvent({
      caseId: created.id,
      action: 'CASE_CREATED',
      actorAdminId: ctx.actorId ?? null,
      metadata: { auto: false, priority: input.priority, type: input.type } as Prisma.InputJsonValue,
    });

    // Link any supplied alerts (must belong to the same user).
    if (input.alertIds?.length) {
      for (const alertId of input.alertIds) {
        await this.linkAlertInternal(alertId, created.id, input.userId, ctx);
      }
    }

    await this.audit(ctx, 'compliance.case.create', created.id, {
      userId: input.userId,
      priority: input.priority,
      type: input.type,
    });

    if (input.priority === 'HIGH' || input.priority === 'CRITICAL') {
      await this.notifyAdminsCaseOpened(created.id, input.userId, input.priority, ctx);
      await this.safeRecomputeRisk(input.userId, ctx);
    }

    return this.get(created.id, ctx);
  },

  async assign(caseId: string, adminId: string | null, ctx: ComplianceContext = {}) {
    const found = await monitoringRepository.findCase(caseId);
    if (!found) throw new NotFoundError('Compliance case not found');
    await monitoringRepository.updateCase(caseId, { assignedToAdminId: adminId });
    await monitoringRepository.createEvent({
      caseId,
      action: 'ASSIGNED',
      actorAdminId: ctx.actorId ?? null,
      metadata: { assignedToAdminId: adminId } as Prisma.InputJsonValue,
    });
    await this.audit(ctx, 'compliance.case.assign', caseId, { assignedToAdminId: adminId });
    return this.get(caseId, ctx);
  },

  async setStatus(
    caseId: string,
    status: ComplianceCaseStatus,
    note: string | undefined,
    ctx: ComplianceContext = {},
  ) {
    const found = await monitoringRepository.findCase(caseId);
    if (!found) throw new NotFoundError('Compliance case not found');

    const data: Prisma.ComplianceCaseUncheckedUpdateInput = { status };
    if (status === 'CLOSED') {
      data.closedAt = new Date();
      data.closedByAdminId = ctx.actorId ?? null;
    }
    await monitoringRepository.updateCase(caseId, data);
    await monitoringRepository.createEvent({
      caseId,
      action: 'STATUS_CHANGED',
      actorAdminId: ctx.actorId ?? null,
      metadata: { from: found.status, to: status } as Prisma.InputJsonValue,
    });
    if (note) {
      await monitoringRepository.createNote({ caseId, adminId: ctx.actorId ?? null, body: note });
    }
    await this.audit(ctx, 'compliance.case.status', caseId, { from: found.status, to: status });

    // Closing removes the case's risk contribution; recompute so the user's
    // score reflects the resolution. (recompute is a no-op without a profile.)
    if (status === 'CLOSED') {
      await this.safeRecomputeRisk(found.userId, ctx);
    }
    return this.get(caseId, ctx);
  },

  async addNote(caseId: string, body: string, ctx: ComplianceContext = {}) {
    const found = await monitoringRepository.findCase(caseId);
    if (!found) throw new NotFoundError('Compliance case not found');
    await monitoringRepository.createNote({ caseId, adminId: ctx.actorId ?? null, body });
    await monitoringRepository.createEvent({
      caseId,
      action: 'NOTE_ADDED',
      actorAdminId: ctx.actorId ?? null,
      metadata: {} as Prisma.InputJsonValue,
    });
    await this.audit(ctx, 'compliance.case.note', caseId, {});
    return this.get(caseId, ctx);
  },

  // ==================================================================
  // Alerts
  // ==================================================================
  async linkAlert(alertId: string, caseId: string, ctx: ComplianceContext = {}) {
    const found = await monitoringRepository.findCase(caseId);
    if (!found) throw new NotFoundError('Compliance case not found');
    await this.linkAlertInternal(alertId, caseId, found.userId, ctx);
    await this.audit(ctx, 'compliance.alert.link', caseId, { alertId });
    return this.get(caseId, ctx);
  },

  async linkAlertInternal(
    alertId: string,
    caseId: string,
    caseUserId: string,
    ctx: ComplianceContext,
  ) {
    const alert = await monitoringRepository.findAlert(alertId);
    if (!alert) throw new NotFoundError('Alert not found');
    if (alert.userId !== caseUserId) {
      throw new BadRequestError('Alert and case belong to different users', { code: 'ALERT_USER_MISMATCH' });
    }
    await monitoringRepository.updateAlert(alertId, { caseId, status: 'LINKED_TO_CASE' });
    await monitoringRepository.createEvent({
      caseId,
      action: 'ALERT_LINKED',
      actorAdminId: ctx.actorId ?? null,
      metadata: { alertId, type: alert.type, auto: false } as Prisma.InputJsonValue,
    });
  },

  async setAlertStatus(
    alertId: string,
    status: ComplianceAlertStatus,
    note: string | undefined,
    ctx: ComplianceContext = {},
  ) {
    const alert = await monitoringRepository.findAlert(alertId);
    if (!alert) throw new NotFoundError('Alert not found');
    const data: Prisma.ComplianceAlertUncheckedUpdateInput = { status };
    if (status === 'RESOLVED' || status === 'DISMISSED') {
      data.resolvedAt = new Date();
      data.resolvedByAdminId = ctx.actorId ?? null;
    }
    const updated = await monitoringRepository.updateAlert(alertId, data);
    if (alert.caseId) {
      await monitoringRepository.createEvent({
        caseId: alert.caseId,
        action: 'ALERT_STATUS_CHANGED',
        actorAdminId: ctx.actorId ?? null,
        metadata: { alertId, from: alert.status, to: status, note: note ?? null } as Prisma.InputJsonValue,
      });
    }
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.alert.status',
      entityType: 'compliance_alert',
      entityId: alertId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { from: alert.status, to: status } as Prisma.InputJsonValue,
    });
    return toAlertDto(updated);
  },

  async listAlerts(
    input: { userId?: string; status?: ComplianceAlertStatus },
    ctx: ComplianceContext = {},
  ) {
    const where: Prisma.ComplianceAlertWhereInput = {
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.status ? { status: input.status } : {}),
    };
    const rows = await monitoringRepository.listAlerts(where);
    await this.audit(ctx, 'compliance.alert.list', undefined, { count: rows.length });
    return { items: rows.map(toAlertDto) };
  },

  // ==================================================================
  // STR draft export (JSON only, STR_DRAFT_ONLY)
  // ==================================================================
  async exportStrDraft(caseId: string, ctx: ComplianceContext = {}): Promise<StrDraftExport> {
    const found = await monitoringRepository.findCase(caseId);
    if (!found) throw new NotFoundError('Compliance case not found');
    const userId = found.userId;

    const cfg = config.compliance.monitoring;
    const since = new Date(Date.now() - cfg.lookbackDays * 24 * 60 * 60 * 1000);

    const [profile, assessments, activity, screening] = await Promise.all([
      complianceRepository.findProfileWithUser(userId),
      complianceRepository.listRiskAssessments(userId),
      monitoringRepository.loadActivity(userId, since),
      buildScreeningView(userId).catch(() => null),
    ]);

    const draft: StrDraftExport = {
      exportType: 'STR_DRAFT_ONLY',
      disclaimer:
        'INTERNAL STR DRAFT ONLY. This is a rule-based/mock compliance draft generated for internal review. ' +
        'It is NOT a Suspicious Transaction Report filed with any FIU or regulator, and contains no raw PAN/Aadhaar or secrets. ' +
        'Screening/risk values may be mock in staging.',
      generatedAt: new Date().toISOString(),
      case: toCaseDetailDto(found),
      user: {
        userId,
        email: found.user.email,
        profile: profile ? toAdminComplianceDto(profile) : null,
      },
      alerts: found.alerts.map(toAlertDto),
      linkedTransactions: {
        withdrawals: activity.withdrawals,
        deposits: activity.deposits,
        trades: activity.trades,
      },
      notes: found.notes.map((n) => ({ id: n.id, adminId: n.adminId, body: n.body, createdAt: n.createdAt })),
      adminActions: found.events.map((e) => ({
        id: e.id,
        action: e.action,
        actorAdminId: e.actorAdminId,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
      riskSummary: {
        level: profile?.riskLevel ?? null,
        score: profile?.riskScore ?? null,
        recentAssessments: assessments.map(toRiskAssessmentDto),
      },
      screeningSummary: screening,
    };

    await monitoringRepository.createEvent({
      caseId,
      action: 'STR_EXPORTED',
      actorAdminId: ctx.actorId ?? null,
      metadata: { alertCount: found.alerts.length } as Prisma.InputJsonValue,
    });
    await this.audit(ctx, 'compliance.str.export', caseId, { userId });

    return draft;
  },

  // ==================================================================
  // Helpers
  // ==================================================================

  /** Admin notification for HIGH/CRITICAL cases via the admin audit channel. */
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

  async safeRecomputeRisk(userId: string, ctx: ComplianceContext): Promise<void> {
    try {
      const profile = await complianceRepository.findProfile(userId);
      if (!profile) return;
      await complianceService.recomputeRisk(userId, 'TRANSACTION', { createdByAdminId: ctx.actorId });
    } catch (err) {
      logger.warn({ err, userId }, 'case: risk recompute failed (non-fatal)');
    }
  },

  /** Admin audit entry (+ admin log when an admin actor is present). */
  async audit(
    ctx: ComplianceContext,
    action: string,
    caseId: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action,
      entityType: 'compliance_case',
      entityId: caseId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: metadata as Prisma.InputJsonValue,
    });
    if (ctx.actorId) {
      await complianceRepository.writeAdminLog({
        adminId: ctx.actorId,
        action,
        targetType: 'compliance_case',
        targetId: caseId,
        afterState: metadata as Prisma.InputJsonValue,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
  },
};

export type CaseService = typeof caseService;
