import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { amlAdminController } from './aml.admin.controller';
import { amlEvaluateSchema, amlPolicyCreateSchema, amlRuleCreateSchema, amlRulePatchSchema } from './aml.validators';
import {
  approvalCreateSchema,
  approvalDecideSchema,
  approvalQuerySchema,
  checklistResponseSchema,
  checklistTemplateSchema,
  taskAssignSchema,
  taskCommentSchema,
  taskCreateSchema,
  taskQuerySchema,
  taskStatusSchema,
} from './workspace.validators';

/**
 * Admin AML policy engine + compliance-officer workspace routes (Stage 5.7),
 * mounted at /admin/v1/compliance. RBAC:
 *   - aml policy view/manage/activate → compliance.amlPolicy.view/manage/activate
 *   - workspace summary               → compliance.workspace.view
 *   - tasks view/manage/assign        → compliance.task.view/manage/assign
 *   - checklists view/manage          → compliance.checklist.view/manage
 *   - approvals view/create/decide    → compliance.approval.view/create/decide
 * SUPER_ADMIN bypasses. Review-only — never blocks/mutates money movement.
 */
export const adminAmlRouter = Router();

// ---- AML policy ----
adminAmlRouter.get('/aml/policies', adminAuthenticate, adminAuthorize('compliance.amlPolicy.view'), asyncHandler(amlAdminController.listPolicies));
adminAmlRouter.post('/aml/policies', adminAuthenticate, adminAuthorize('compliance.amlPolicy.manage'), validate({ body: amlPolicyCreateSchema }), asyncHandler(amlAdminController.createPolicy));
adminAmlRouter.post('/aml/evaluate', adminAuthenticate, adminAuthorize('compliance.amlPolicy.view'), validate({ body: amlEvaluateSchema }), asyncHandler(amlAdminController.evaluate));
adminAmlRouter.get('/aml/policies/:policyId', adminAuthenticate, adminAuthorize('compliance.amlPolicy.view'), asyncHandler(amlAdminController.getPolicy));
adminAmlRouter.post('/aml/policies/:policyId/activate', adminAuthenticate, adminAuthorize('compliance.amlPolicy.activate'), asyncHandler(amlAdminController.activatePolicy));
adminAmlRouter.post('/aml/policies/:policyId/rules', adminAuthenticate, adminAuthorize('compliance.amlPolicy.manage'), validate({ body: amlRuleCreateSchema }), asyncHandler(amlAdminController.addRule));
adminAmlRouter.patch('/aml/rules/:ruleId', adminAuthenticate, adminAuthorize('compliance.amlPolicy.manage'), validate({ body: amlRulePatchSchema }), asyncHandler(amlAdminController.patchRule));

// ---- workspace ----
adminAmlRouter.get('/workspace/summary', adminAuthenticate, adminAuthorize('compliance.workspace.view'), asyncHandler(amlAdminController.summary));
adminAmlRouter.get('/workspace/tasks', adminAuthenticate, adminAuthorize('compliance.task.view'), validate({ query: taskQuerySchema }), asyncHandler(amlAdminController.listTasks));
adminAmlRouter.post('/workspace/tasks', adminAuthenticate, adminAuthorize('compliance.task.manage'), validate({ body: taskCreateSchema }), asyncHandler(amlAdminController.createTask));

// ---- checklists (static before /tasks/:taskId) ----
adminAmlRouter.get('/workspace/checklists/templates', adminAuthenticate, adminAuthorize('compliance.checklist.view'), asyncHandler(amlAdminController.listTemplates));
adminAmlRouter.post('/workspace/checklists/templates', adminAuthenticate, adminAuthorize('compliance.checklist.manage'), validate({ body: checklistTemplateSchema }), asyncHandler(amlAdminController.createTemplate));

// ---- approvals (static before /tasks/:taskId) ----
adminAmlRouter.get('/workspace/approvals', adminAuthenticate, adminAuthorize('compliance.approval.view'), validate({ query: approvalQuerySchema }), asyncHandler(amlAdminController.listApprovals));
adminAmlRouter.post('/workspace/approvals', adminAuthenticate, adminAuthorize('compliance.approval.create'), validate({ body: approvalCreateSchema }), asyncHandler(amlAdminController.createApproval));
adminAmlRouter.get('/workspace/approvals/:approvalId', adminAuthenticate, adminAuthorize('compliance.approval.view'), asyncHandler(amlAdminController.getApproval));
adminAmlRouter.post('/workspace/approvals/:approvalId/approve', adminAuthenticate, adminAuthorize('compliance.approval.decide'), validate({ body: approvalDecideSchema }), asyncHandler(amlAdminController.approveApproval));
adminAmlRouter.post('/workspace/approvals/:approvalId/reject', adminAuthenticate, adminAuthorize('compliance.approval.decide'), validate({ body: approvalDecideSchema }), asyncHandler(amlAdminController.rejectApproval));

// ---- task detail + sub-resources ----
adminAmlRouter.get('/workspace/tasks/:taskId', adminAuthenticate, adminAuthorize('compliance.task.view'), asyncHandler(amlAdminController.getTask));
adminAmlRouter.post('/workspace/tasks/:taskId/assign', adminAuthenticate, adminAuthorize('compliance.task.assign'), validate({ body: taskAssignSchema }), asyncHandler(amlAdminController.assignTask));
adminAmlRouter.post('/workspace/tasks/:taskId/status', adminAuthenticate, adminAuthorize('compliance.task.manage'), validate({ body: taskStatusSchema }), asyncHandler(amlAdminController.setTaskStatus));
adminAmlRouter.post('/workspace/tasks/:taskId/comment', adminAuthenticate, adminAuthorize('compliance.task.manage'), validate({ body: taskCommentSchema }), asyncHandler(amlAdminController.commentTask));
adminAmlRouter.get('/workspace/tasks/:taskId/events', adminAuthenticate, adminAuthorize('compliance.task.view'), asyncHandler(amlAdminController.taskEvents));
adminAmlRouter.get('/workspace/tasks/:taskId/checklist', adminAuthenticate, adminAuthorize('compliance.checklist.view'), asyncHandler(amlAdminController.getTaskChecklist));
adminAmlRouter.post('/workspace/tasks/:taskId/checklist', adminAuthenticate, adminAuthorize('compliance.checklist.manage'), validate({ body: checklistResponseSchema }), asyncHandler(amlAdminController.saveTaskChecklist));
