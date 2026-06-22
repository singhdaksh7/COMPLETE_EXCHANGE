import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { legalAdminController } from './legal.admin.controller';
import { legalAcceptancesQuerySchema, legalDocumentCreateSchema, legalDocsQuerySchema } from './legal.validators';

/**
 * Admin legal routes (mounted at /admin/v1/legal). RBAC:
 *   - documents view   → legal.document.view
 *   - documents manage → legal.document.manage
 *   - acceptances view → legal.acceptance.view
 */
export const adminLegalRouter = Router();

adminLegalRouter.get('/documents', adminAuthenticate, adminAuthorize('legal.document.view'), validate({ query: legalDocsQuerySchema }), asyncHandler(legalAdminController.listDocuments));
adminLegalRouter.post('/documents', adminAuthenticate, adminAuthorize('legal.document.manage'), validate({ body: legalDocumentCreateSchema }), asyncHandler(legalAdminController.createDocument));
adminLegalRouter.get('/acceptances', adminAuthenticate, adminAuthorize('legal.acceptance.view'), validate({ query: legalAcceptancesQuerySchema }), asyncHandler(legalAdminController.listAcceptances));
adminLegalRouter.get('/users/:userId/acceptances', adminAuthenticate, adminAuthorize('legal.acceptance.view'), asyncHandler(legalAdminController.userAcceptances));
