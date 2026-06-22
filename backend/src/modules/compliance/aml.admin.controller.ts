import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { amlService } from './aml.service';
import { workspaceService } from './workspace.service';
import type { ComplianceContext } from './compliance.types';
import type { AmlEvaluateDto, AmlPolicyCreateDto, AmlRuleCreateDto, AmlRulePatchDto } from './aml.validators';
import type {
  ApprovalCreateDto,
  ApprovalQueryDto,
  ChecklistResponseDto,
  ChecklistTemplateDto,
  TaskAssignDto,
  TaskCommentDto,
  TaskCreateDto,
  TaskQueryDto,
  TaskStatusDto,
} from './workspace.validators';

function ctx(req: Request): ComplianceContext {
  return { actorId: req.admin?.id, ip: req.ip, userAgent: req.headers['user-agent'], requestId: String(req.id) };
}

/** Admin controller for the Stage 5.7 AML policy + compliance workspace surface. */
export const amlAdminController = {
  // ---- AML policy ----
  async listPolicies(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, { items: await amlService.listPolicies() });
  },
  async createPolicy(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await amlService.createPolicy(req.body as AmlPolicyCreateDto, ctx(req)), 201);
  },
  async getPolicy(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await amlService.getPolicy(req.params.policyId));
  },
  async activatePolicy(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await amlService.activate(req.params.policyId, ctx(req)));
  },
  async addRule(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await amlService.addRule(req.params.policyId, req.body as AmlRuleCreateDto, ctx(req)), 201);
  },
  async patchRule(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await amlService.updateRule(req.params.ruleId, req.body as AmlRulePatchDto, ctx(req)));
  },
  async evaluate(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await amlService.evaluate(req.body as AmlEvaluateDto, ctx(req)));
  },

  // ---- workspace ----
  async summary(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.summary(ctx(req)));
  },
  async listTasks(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.list(req.query as unknown as TaskQueryDto, ctx(req)));
  },
  async createTask(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.createTask(req.body as TaskCreateDto, ctx(req)), 201);
  },
  async getTask(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.getTask(req.params.taskId));
  },
  async assignTask(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { adminId } = req.body as TaskAssignDto;
    sendSuccess(res, await workspaceService.assign(req.params.taskId, adminId ?? null, ctx(req)));
  },
  async setTaskStatus(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { status, note } = req.body as TaskStatusDto;
    sendSuccess(res, await workspaceService.setStatus(req.params.taskId, status, note, ctx(req)));
  },
  async commentTask(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { body } = req.body as TaskCommentDto;
    sendSuccess(res, await workspaceService.addComment(req.params.taskId, body, ctx(req)));
  },
  async taskEvents(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, { items: await workspaceService.events(req.params.taskId) });
  },

  // ---- checklists ----
  async listTemplates(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, { items: await workspaceService.listTemplates(req.query.taskType as never) });
  },
  async createTemplate(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.createTemplate(req.body as ChecklistTemplateDto, ctx(req)), 201);
  },
  async getTaskChecklist(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.getTaskChecklist(req.params.taskId));
  },
  async saveTaskChecklist(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.saveChecklist(req.params.taskId, req.body as ChecklistResponseDto, ctx(req)), 201);
  },

  // ---- approvals (maker-checker) ----
  async listApprovals(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.listApprovals(req.query as unknown as ApprovalQueryDto));
  },
  async createApproval(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.createApproval(req.body as ApprovalCreateDto, ctx(req)), 201);
  },
  async getApproval(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.getApproval(req.params.approvalId));
  },
  async approveApproval(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.decideApproval(req.params.approvalId, 'APPROVED', req.body?.note, ctx(req)));
  },
  async rejectApproval(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await workspaceService.decideApproval(req.params.approvalId, 'REJECTED', req.body?.note, ctx(req)));
  },
};
