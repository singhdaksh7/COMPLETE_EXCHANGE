import type {
  ComplianceApprovalStatus,
  ComplianceApprovalType,
  ComplianceTaskPriority,
  ComplianceTaskStatus,
  ComplianceTaskType,
  Prisma,
} from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { workspaceRepository } from './workspace.repository';
import { computeSlaStatus } from './workspace.sla';
import type { ComplianceContext } from './compliance.types';

/**
 * Compliance-officer workspace service (Stage 5.7): task queue, SLA tracking,
 * AML review checklists, and maker-checker approvals. All review-only — it never
 * moves money, submits a report, deletes a record, or blocks an existing flow.
 * The maker of an approval can NEVER be its checker.
 */

export interface CreateTaskInput {
  type: ComplianceTaskType;
  title: string;
  description?: string;
  priority?: ComplianceTaskPriority;
  assignedToAdminId?: string | null;
  slaMinutes?: number;
  scopeUserId?: string;
  caseId?: string;
  alertId?: string;
  walletRiskCheckId?: string;
  fiuReportId?: string;
  evidencePackId?: string;
  dedupeKey?: string;
}

export const workspaceService = {
  // ==================================================================
  // Dashboard summary
  // ==================================================================
  async summary(ctx: ComplianceContext = {}) {
    const [base, fiuNeedingReview] = await Promise.all([
      workspaceRepository.summary(ctx.actorId),
      workspaceRepository.fiuNeedingReview(),
    ]);
    return { ...base, fiuNeedingReview };
  },

  // ==================================================================
  // Tasks
  // ==================================================================
  async createTask(input: CreateTaskInput, ctx: ComplianceContext = {}) {
    if (input.dedupeKey) {
      const existing = await workspaceRepository.findTaskByDedupe(input.dedupeKey);
      if (existing) return this.getTask(existing.id);
    }
    const now = new Date();
    const task = await workspaceRepository.createTask({
      type: input.type,
      status: 'OPEN',
      priority: input.priority ?? 'MEDIUM',
      title: input.title,
      description: input.description ?? null,
      assignedToAdminId: input.assignedToAdminId ?? null,
      createdByAdminId: ctx.actorId ?? null,
      slaMinutes: input.slaMinutes ?? null,
      dueAt: input.slaMinutes ? new Date(now.getTime() + input.slaMinutes * 60000) : null,
      scopeUserId: input.scopeUserId ?? null,
      caseId: input.caseId ?? null,
      alertId: input.alertId ?? null,
      walletRiskCheckId: input.walletRiskCheckId ?? null,
      fiuReportId: input.fiuReportId ?? null,
      evidencePackId: input.evidencePackId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    });

    if (input.slaMinutes) {
      const dueAt = new Date(now.getTime() + input.slaMinutes * 60000);
      await workspaceRepository.upsertSla(
        task.id,
        { taskId: task.id, slaMinutes: input.slaMinutes, startedAt: now, dueAt, status: computeSlaStatus({ startedAt: now, dueAt, now }) },
        {},
      );
    }
    await workspaceRepository.createEvent({ taskId: task.id, action: 'CREATED', actorAdminId: ctx.actorId ?? null, metadata: { type: input.type, priority: input.priority ?? 'MEDIUM' } as Prisma.InputJsonValue });
    await this.audit(ctx, 'compliance.task.create', task.id, { type: input.type });
    return this.getTask(task.id);
  },

  async getTask(id: string) {
    const task = await workspaceRepository.findTask(id);
    if (!task) throw new NotFoundError('Compliance task not found');
    // Recompute live SLA posture (review-only).
    let slaStatus = task.sla?.status ?? null;
    if (task.sla) {
      slaStatus = computeSlaStatus({ startedAt: task.sla.startedAt, dueAt: task.sla.dueAt, completedAt: task.sla.completedAt });
    }
    return { ...task, liveSlaStatus: slaStatus };
  },

  async list(input: { status?: ComplianceTaskStatus; type?: ComplianceTaskType; assignedToAdminId?: string; scopeUserId?: string; cursor?: string; limit: number }, ctx: ComplianceContext = {}) {
    const rows = await workspaceRepository.listTasks(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    void ctx;
    return {
      items: page.map((t) => ({
        id: t.id, type: t.type, status: t.status, priority: t.priority, title: t.title,
        assignedToAdminId: t.assignedToAdminId, scopeUserId: t.scopeUserId, email: t.user?.email ?? null,
        slaStatus: t.sla ? computeSlaStatus({ startedAt: t.sla.startedAt, dueAt: t.sla.dueAt, completedAt: t.sla.completedAt }) : null,
        dueAt: t.dueAt, createdAt: t.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  async assign(taskId: string, adminId: string | null, ctx: ComplianceContext = {}) {
    const task = await workspaceRepository.findTask(taskId);
    if (!task) throw new NotFoundError('Compliance task not found');
    await workspaceRepository.updateTask(taskId, { assignedToAdminId: adminId });
    await workspaceRepository.createEvent({ taskId, action: 'ASSIGNED', actorAdminId: ctx.actorId ?? null, metadata: { assignedToAdminId: adminId } as Prisma.InputJsonValue });
    await this.audit(ctx, 'compliance.task.assign', taskId, { assignedToAdminId: adminId });
    return this.getTask(taskId);
  },

  async setStatus(taskId: string, status: ComplianceTaskStatus, note: string | undefined, ctx: ComplianceContext = {}) {
    const task = await workspaceRepository.findTask(taskId);
    if (!task) throw new NotFoundError('Compliance task not found');

    if (status === 'COMPLETED') {
      // Enforce required-checklist completion when configured.
      const incompleteRequired = await this.hasIncompleteRequiredChecklist(task.checklistResponses);
      if (incompleteRequired) {
        throw new BadRequestError('A required checklist must be completed before completing this task', { code: 'CHECKLIST_REQUIRED' });
      }
    }

    const data: Prisma.ComplianceTaskUncheckedUpdateInput = { status };
    if (status === 'COMPLETED' || status === 'CANCELLED') data.completedAt = new Date();
    await workspaceRepository.updateTask(taskId, data);

    if (task.sla && (status === 'COMPLETED' || status === 'CANCELLED')) {
      const now = new Date();
      await workspaceRepository.upsertSla(taskId, { taskId, slaMinutes: task.sla.slaMinutes, startedAt: task.sla.startedAt, dueAt: task.sla.dueAt, status: 'COMPLETED' }, { status: 'COMPLETED', completedAt: now });
    }
    await workspaceRepository.createEvent({ taskId, action: 'STATUS_CHANGED', actorAdminId: ctx.actorId ?? null, metadata: { from: task.status, to: status, note: note ?? null } as Prisma.InputJsonValue });
    await this.audit(ctx, 'compliance.task.status', taskId, { from: task.status, to: status });
    return this.getTask(taskId);
  },

  async addComment(taskId: string, body: string, ctx: ComplianceContext = {}) {
    const task = await workspaceRepository.findTask(taskId);
    if (!task) throw new NotFoundError('Compliance task not found');
    await workspaceRepository.createEvent({ taskId, action: 'COMMENT', actorAdminId: ctx.actorId ?? null, metadata: { body } as Prisma.InputJsonValue });
    await this.audit(ctx, 'compliance.task.comment', taskId, {});
    return this.getTask(taskId);
  },

  async events(taskId: string) {
    const task = await workspaceRepository.findTask(taskId);
    if (!task) throw new NotFoundError('Compliance task not found');
    return task.events;
  },

  // ==================================================================
  // Checklists
  // ==================================================================
  listTemplates(taskType?: ComplianceTaskType) {
    return workspaceRepository.listTemplates(taskType);
  },

  async createTemplate(
    input: { taskType: ComplianceTaskType; name: string; version?: string; items: Array<{ key: string; label: string; required?: boolean }>; requiredForCompletion?: boolean },
    ctx: ComplianceContext = {},
  ) {
    const tpl = await workspaceRepository.createTemplate({
      taskType: input.taskType,
      name: input.name,
      version: input.version ?? 'v1',
      items: input.items as unknown as Prisma.InputJsonValue,
      requiredForCompletion: input.requiredForCompletion ?? false,
      active: true,
      createdByAdminId: ctx.actorId ?? null,
    });
    await this.audit(ctx, 'compliance.checklist.template.create', tpl.id, { taskType: input.taskType });
    return tpl;
  },

  async getTaskChecklist(taskId: string) {
    const task = await workspaceRepository.findTask(taskId);
    if (!task) throw new NotFoundError('Compliance task not found');
    const [responses, templates] = await Promise.all([
      workspaceRepository.listResponsesForTask(taskId),
      workspaceRepository.listTemplates(task.type),
    ]);
    return { taskId, templates, responses };
  },

  async saveChecklist(
    taskId: string,
    input: { templateId?: string; answers: Array<{ key: string; value?: unknown; note?: string }>; complete?: boolean },
    ctx: ComplianceContext = {},
  ) {
    const task = await workspaceRepository.findTask(taskId);
    if (!task) throw new NotFoundError('Compliance task not found');

    const existing = task.checklistResponses.find((r) => (input.templateId ? r.templateId === input.templateId : r.templateId === null));
    const completedFields = input.complete
      ? { completed: true, completedByAdminId: ctx.actorId ?? null, completedAt: new Date() }
      : {};

    const response = existing
      ? await workspaceRepository.updateResponse(existing.id, { answers: input.answers as unknown as Prisma.InputJsonValue, ...completedFields })
      : await workspaceRepository.createResponse({ taskId, templateId: input.templateId ?? null, answers: input.answers as unknown as Prisma.InputJsonValue, ...completedFields });

    await workspaceRepository.createEvent({ taskId, action: 'CHECKLIST_SAVED', actorAdminId: ctx.actorId ?? null, metadata: { templateId: input.templateId ?? null, completed: !!input.complete } as Prisma.InputJsonValue });
    await this.audit(ctx, 'compliance.checklist.save', taskId, { completed: !!input.complete });
    return response;
  },

  async hasIncompleteRequiredChecklist(responses: Array<{ templateId: string | null; completed: boolean }>): Promise<boolean> {
    for (const r of responses) {
      if (!r.templateId) continue;
      const tpl = await workspaceRepository.findTemplate(r.templateId);
      if (tpl?.requiredForCompletion && !r.completed) return true;
    }
    return false;
  },

  // ==================================================================
  // Maker-checker approvals
  // ==================================================================
  async createApproval(
    input: { approvalType: ComplianceApprovalType; title: string; reason?: string; targetType?: string; targetId?: string; taskId?: string; metadata?: Record<string, unknown> },
    ctx: ComplianceContext = {},
  ) {
    if (!ctx.actorId) throw new ForbiddenError('An admin actor is required to create an approval request');
    const approval = await workspaceRepository.createApproval({
      approvalType: input.approvalType,
      status: 'PENDING',
      title: input.title,
      reason: input.reason ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      taskId: input.taskId ?? null,
      makerAdminId: ctx.actorId,
      metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
    });
    await this.audit(ctx, 'compliance.approval.create', approval.id, { approvalType: input.approvalType });
    return approval;
  },

  async decideApproval(approvalId: string, decision: 'APPROVED' | 'REJECTED', note: string | undefined, ctx: ComplianceContext = {}) {
    if (!ctx.actorId) throw new ForbiddenError('An admin actor is required to decide an approval');
    const approval = await workspaceRepository.findApproval(approvalId);
    if (!approval) throw new NotFoundError('Approval request not found');
    if (approval.status !== 'PENDING') throw new BadRequestError('Approval is not pending', { code: 'APPROVAL_NOT_PENDING' });
    // Maker-checker: the maker can never be the checker.
    if (approval.makerAdminId === ctx.actorId) {
      throw new ForbiddenError('The maker cannot approve or reject their own request');
    }
    const updated = await workspaceRepository.updateApproval(approvalId, {
      status: decision,
      checkerAdminId: ctx.actorId,
      decisionNote: note ?? null,
      decidedAt: new Date(),
    });
    await this.audit(ctx, decision === 'APPROVED' ? 'compliance.approval.approve' : 'compliance.approval.reject', approvalId, { approvalType: approval.approvalType });
    return updated;
  },

  async listApprovals(input: { status?: ComplianceApprovalStatus; approvalType?: ComplianceApprovalType; cursor?: string; limit: number }) {
    const rows = await workspaceRepository.listApprovals(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },

  async getApproval(id: string) {
    const a = await workspaceRepository.findApproval(id);
    if (!a) throw new NotFoundError('Approval request not found');
    return a;
  },

  async audit(ctx: ComplianceContext, action: string, entityId: string, metadata: Record<string, unknown>) {
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action,
      entityType: 'compliance_task',
      entityId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: metadata as Prisma.InputJsonValue,
    });
  },
};

export type WorkspaceService = typeof workspaceService;
