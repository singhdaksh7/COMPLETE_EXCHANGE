import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { taxAdminController } from './tax.admin.controller';
import { taxQuerySchema, taxRuleUpsertSchema, taxStatementGenerateSchema } from './tax.validators';

/**
 * Admin tax routes (mounted at /admin/v1/tax). RBAC:
 *   - rules view            → tax.rule.view
 *   - rules manage          → tax.rule.manage
 *   - tds records view      → tax.tds.view
 *   - statements view       → tax.statement.view
 *   - statements generate   → tax.statement.generate
 * Calculation-only — no ledger deduction, no government filing.
 */
export const adminTaxRouter = Router();

adminTaxRouter.get('/rules', adminAuthenticate, adminAuthorize('tax.rule.view'), asyncHandler(taxAdminController.listRules));
adminTaxRouter.post('/rules', adminAuthenticate, adminAuthorize('tax.rule.manage'), validate({ body: taxRuleUpsertSchema }), asyncHandler(taxAdminController.upsertRule));
adminTaxRouter.get('/tds-records', adminAuthenticate, adminAuthorize('tax.tds.view'), validate({ query: taxQuerySchema }), asyncHandler(taxAdminController.listTds));
adminTaxRouter.get('/statements', adminAuthenticate, adminAuthorize('tax.statement.view'), validate({ query: taxQuerySchema }), asyncHandler(taxAdminController.listStatements));
adminTaxRouter.post('/statements/generate', adminAuthenticate, adminAuthorize('tax.statement.generate'), validate({ body: taxStatementGenerateSchema }), asyncHandler(taxAdminController.generateStatement));
