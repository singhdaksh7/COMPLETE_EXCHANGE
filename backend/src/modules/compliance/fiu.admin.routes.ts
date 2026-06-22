import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { fiuAdminController } from './fiu.admin.controller';
import { fiuExportsQuerySchema, fiuGenerateSchema, fiuQuerySchema, fiuStatusSchema } from './fiu.validators';

/**
 * Admin FIU draft-reporting routes (mounted at /admin/v1/compliance/fiu). RBAC:
 *   - view     → compliance.fiuReport.view
 *   - generate → compliance.fiuReport.generate
 *   - validate → compliance.fiuReport.validate
 *   - export   → compliance.fiuReport.export
 *   - manage   → compliance.fiuReport.manage
 * DRAFT-ONLY — never submitted to FIU.
 */
export const adminFiuRouter = Router();

adminFiuRouter.post('/fiu/draft-reports', adminAuthenticate, adminAuthorize('compliance.fiuReport.generate'), validate({ body: fiuGenerateSchema }), asyncHandler(fiuAdminController.create));
adminFiuRouter.get('/fiu/draft-reports', adminAuthenticate, adminAuthorize('compliance.fiuReport.view'), validate({ query: fiuQuerySchema }), asyncHandler(fiuAdminController.list));
adminFiuRouter.get('/fiu/exports', adminAuthenticate, adminAuthorize('compliance.fiuReport.view'), validate({ query: fiuExportsQuerySchema }), asyncHandler(fiuAdminController.exports));
adminFiuRouter.get('/fiu/draft-reports/:reportId', adminAuthenticate, adminAuthorize('compliance.fiuReport.view'), asyncHandler(fiuAdminController.get));
adminFiuRouter.get('/fiu/draft-reports/:reportId/issues', adminAuthenticate, adminAuthorize('compliance.fiuReport.view'), asyncHandler(fiuAdminController.issues));
adminFiuRouter.get('/fiu/draft-reports/:reportId/export', adminAuthenticate, adminAuthorize('compliance.fiuReport.export'), asyncHandler(fiuAdminController.export));
adminFiuRouter.post('/fiu/draft-reports/:reportId/validate', adminAuthenticate, adminAuthorize('compliance.fiuReport.validate'), asyncHandler(fiuAdminController.validate));
adminFiuRouter.post('/fiu/draft-reports/:reportId/status', adminAuthenticate, adminAuthorize('compliance.fiuReport.manage'), validate({ body: fiuStatusSchema }), asyncHandler(fiuAdminController.setStatus));
