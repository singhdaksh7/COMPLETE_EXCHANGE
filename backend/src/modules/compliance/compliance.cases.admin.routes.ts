import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { complianceCasesAdminController } from './compliance.cases.admin.controller';
import {
  alertLinkCaseSchema,
  alertStatusSchema,
  caseAssignSchema,
  caseCreateSchema,
  caseListQuerySchema,
  caseNoteSchema,
  caseStatusSchema,
  monitoringRunSchema,
} from './case.validators';

/**
 * Admin compliance MONITORING / CASE routes (Stage 5.2), mounted at
 * /admin/v1/compliance alongside the Stage 5.0/5.1 router.
 *
 * RBAC:
 *   - cases list/detail/summary  → compliance.case.view
 *   - case create/status/note    → compliance.case.manage
 *   - case assign                → compliance.case.assign
 *   - alerts list                → compliance.alert.view
 *   - alert link/status          → compliance.alert.manage
 *   - monitoring run             → compliance.monitoring.run
 *   - STR draft export           → compliance.str.export
 * SUPER_ADMIN bypasses. All responses are masked/secrets-free.
 */
export const adminComplianceCasesRouter = Router();

// ---- monitoring ----
adminComplianceCasesRouter.post(
  '/monitoring/run',
  adminAuthenticate,
  adminAuthorize('compliance.monitoring.run'),
  validate({ body: monitoringRunSchema }),
  asyncHandler(complianceCasesAdminController.runMonitoring),
);

// ---- cases ----
// Static routes BEFORE the dynamic :caseId param route.
adminComplianceCasesRouter.get(
  '/cases/summary',
  adminAuthenticate,
  adminAuthorize('compliance.case.view'),
  asyncHandler(complianceCasesAdminController.summary),
);

adminComplianceCasesRouter.get(
  '/cases',
  adminAuthenticate,
  adminAuthorize('compliance.case.view'),
  validate({ query: caseListQuerySchema }),
  asyncHandler(complianceCasesAdminController.listCases),
);

adminComplianceCasesRouter.post(
  '/cases',
  adminAuthenticate,
  adminAuthorize('compliance.case.manage'),
  validate({ body: caseCreateSchema }),
  asyncHandler(complianceCasesAdminController.createCase),
);

adminComplianceCasesRouter.get(
  '/cases/:caseId',
  adminAuthenticate,
  adminAuthorize('compliance.case.view'),
  asyncHandler(complianceCasesAdminController.getCase),
);

adminComplianceCasesRouter.get(
  '/cases/:caseId/export-str-draft',
  adminAuthenticate,
  adminAuthorize('compliance.str.export'),
  asyncHandler(complianceCasesAdminController.exportStrDraft),
);

adminComplianceCasesRouter.post(
  '/cases/:caseId/assign',
  adminAuthenticate,
  adminAuthorize('compliance.case.assign'),
  validate({ body: caseAssignSchema }),
  asyncHandler(complianceCasesAdminController.assignCase),
);

adminComplianceCasesRouter.post(
  '/cases/:caseId/status',
  adminAuthenticate,
  adminAuthorize('compliance.case.manage'),
  validate({ body: caseStatusSchema }),
  asyncHandler(complianceCasesAdminController.setCaseStatus),
);

adminComplianceCasesRouter.post(
  '/cases/:caseId/note',
  adminAuthenticate,
  adminAuthorize('compliance.case.manage'),
  validate({ body: caseNoteSchema }),
  asyncHandler(complianceCasesAdminController.addCaseNote),
);

// ---- alerts ----
adminComplianceCasesRouter.get(
  '/alerts',
  adminAuthenticate,
  adminAuthorize('compliance.alert.view'),
  asyncHandler(complianceCasesAdminController.listAlerts),
);

adminComplianceCasesRouter.post(
  '/alerts/:alertId/link-case',
  adminAuthenticate,
  adminAuthorize('compliance.alert.manage'),
  validate({ body: alertLinkCaseSchema }),
  asyncHandler(complianceCasesAdminController.linkAlertToCase),
);

adminComplianceCasesRouter.post(
  '/alerts/:alertId/status',
  adminAuthenticate,
  adminAuthorize('compliance.alert.manage'),
  validate({ body: alertStatusSchema }),
  asyncHandler(complianceCasesAdminController.setAlertStatus),
);
