import {
  Prisma,
  type AmlChecklistResponse,
  type AmlChecklistTemplate,
  type ComplianceApprovalRequest,
  type ComplianceApprovalStatus,
  type ComplianceApprovalType,
  type ComplianceTask,
  type ComplianceTaskEvent,
  type ComplianceTaskStatus,
  type ComplianceTaskType,
  type ComplianceSlaTracker,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 5.7 compliance-officer workspace tables. Owns tasks,
 * task events, SLA trackers, checklist templates/responses and maker-checker
 * approvals. It never touches money-movement state and never deletes a record.
 */

export type TaskWithRelations = ComplianceTask & {
  events: ComplianceTaskEvent[];
  checklistResponses: AmlChecklistResponse[];
  sla: ComplianceSlaTracker | null;
  user: { email: string } | null;
};

export const workspaceRepository = {
  /* ---------------- tasks ---------------- */
  createTask(data: Prisma.ComplianceTaskUncheckedCreateInput): Promise<ComplianceTask> {
    return prisma.complianceTask.create({ data });
  },
  findTaskByDedupe(dedupeKey: string): Promise<ComplianceTask | null> {
    return prisma.complianceTask.findUnique({ where: { dedupeKey } });
  },
  updateTask(id: string, data: Prisma.ComplianceTaskUncheckedUpdateInput): Promise<ComplianceTask> {
    return prisma.complianceTask.update({ where: { id }, data });
  },
  findTask(id: string): Promise<TaskWithRelations | null> {
    return prisma.complianceTask.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'desc' } },
        checklistResponses: { orderBy: { createdAt: 'desc' } },
        sla: true,
        user: { select: { email: true } },
      },
    }) as Promise<TaskWithRelations | null>;
  },
  listTasks(input: {
    status?: ComplianceTaskStatus;
    type?: ComplianceTaskType;
    assignedToAdminId?: string;
    scopeUserId?: string;
    cursor?: string;
    limit: number;
  }): Promise<(ComplianceTask & { user: { email: string } | null; sla: ComplianceSlaTracker | null })[]> {
    return prisma.complianceTask.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.assignedToAdminId ? { assignedToAdminId: input.assignedToAdminId } : {}),
        ...(input.scopeUserId ? { scopeUserId: input.scopeUserId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      include: { user: { select: { email: true } }, sla: true },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    }) as Promise<(ComplianceTask & { user: { email: string } | null; sla: ComplianceSlaTracker | null })[]>;
  },

  createEvent(data: Prisma.ComplianceTaskEventUncheckedCreateInput): Promise<ComplianceTaskEvent> {
    return prisma.complianceTaskEvent.create({ data });
  },

  /* ---------------- SLA ---------------- */
  upsertSla(
    taskId: string,
    create: Prisma.ComplianceSlaTrackerUncheckedCreateInput,
    update: Prisma.ComplianceSlaTrackerUncheckedUpdateInput,
  ): Promise<ComplianceSlaTracker> {
    return prisma.complianceSlaTracker.upsert({ where: { taskId }, create: { ...create, taskId }, update });
  },

  /* ---------------- checklists ---------------- */
  createTemplate(data: Prisma.AmlChecklistTemplateUncheckedCreateInput): Promise<AmlChecklistTemplate> {
    return prisma.amlChecklistTemplate.create({ data });
  },
  listTemplates(taskType?: ComplianceTaskType): Promise<AmlChecklistTemplate[]> {
    return prisma.amlChecklistTemplate.findMany({
      where: { active: true, ...(taskType ? { taskType } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },
  findTemplate(id: string): Promise<AmlChecklistTemplate | null> {
    return prisma.amlChecklistTemplate.findUnique({ where: { id } });
  },
  createResponse(data: Prisma.AmlChecklistResponseUncheckedCreateInput): Promise<AmlChecklistResponse> {
    return prisma.amlChecklistResponse.create({ data });
  },
  updateResponse(id: string, data: Prisma.AmlChecklistResponseUncheckedUpdateInput): Promise<AmlChecklistResponse> {
    return prisma.amlChecklistResponse.update({ where: { id }, data });
  },
  listResponsesForTask(taskId: string): Promise<AmlChecklistResponse[]> {
    return prisma.amlChecklistResponse.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' } });
  },

  /* ---------------- approvals ---------------- */
  createApproval(data: Prisma.ComplianceApprovalRequestUncheckedCreateInput): Promise<ComplianceApprovalRequest> {
    return prisma.complianceApprovalRequest.create({ data });
  },
  findApproval(id: string): Promise<ComplianceApprovalRequest | null> {
    return prisma.complianceApprovalRequest.findUnique({ where: { id } });
  },
  updateApproval(id: string, data: Prisma.ComplianceApprovalRequestUncheckedUpdateInput): Promise<ComplianceApprovalRequest> {
    return prisma.complianceApprovalRequest.update({ where: { id }, data });
  },
  listApprovals(input: { status?: ComplianceApprovalStatus; approvalType?: ComplianceApprovalType; cursor?: string; limit: number }): Promise<ComplianceApprovalRequest[]> {
    return prisma.complianceApprovalRequest.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.approvalType ? { approvalType: input.approvalType } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  /* ---------------- summary counts ---------------- */
  async summary(adminId: string | undefined): Promise<{
    openTasks: number;
    assignedToMe: number;
    breachedSla: number;
    highCritical: number;
    pendingApprovals: number;
  }> {
    const [openTasks, assignedToMe, breachedSla, highCritical, pendingApprovals] = await Promise.all([
      prisma.complianceTask.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      adminId
        ? prisma.complianceTask.count({ where: { assignedToAdminId: adminId, status: { notIn: ['COMPLETED', 'CANCELLED'] } } })
        : Promise.resolve(0),
      prisma.complianceSlaTracker.count({ where: { status: 'BREACHED' } }),
      prisma.complianceTask.count({ where: { priority: { in: ['HIGH', 'CRITICAL'] }, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      prisma.complianceApprovalRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return { openTasks, assignedToMe, breachedSla, highCritical, pendingApprovals };
  },

  /** FIU drafts needing internal review (read-only count from Stage 5.6). */
  fiuNeedingReview(): Promise<number> {
    return prisma.fiuDraftReport.count({ where: { status: 'READY_FOR_INTERNAL_REVIEW' } });
  },
};

export type WorkspaceRepository = typeof workspaceRepository;
