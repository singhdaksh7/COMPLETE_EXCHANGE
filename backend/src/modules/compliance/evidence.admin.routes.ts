import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { evidenceAdminController } from './evidence.admin.controller';
import {
  evidencePackCreateSchema,
  evidencePackQuerySchema,
  exportEventsQuerySchema,
  retentionPolicySchema,
  retentionReviewQuerySchema,
  retentionReviewStatusSchema,
} from './evidence.validators';

/**
 * Admin compliance EVIDENCE PACK + RECORD RETENTION routes (Stage 5.4), mounted
 * at /admin/v1/compliance alongside the Stage 5.0–5.3 routers.
 *
 * RBAC:
 *   - evidence pack view             → compliance.evidencePack.view
 *   - evidence pack generate         → compliance.evidencePack.generate
 *   - evidence pack export           → compliance.evidencePack.export
 *   - retention view                 → compliance.retention.view
 *   - retention manage               → compliance.retention.manage
 *   - export-event view              → compliance.exportEvent.view
 * SUPER_ADMIN bypasses. All packs are masked/secrets-free.
 */
export const adminEvidenceRouter = Router();

// ---- evidence packs ----
adminEvidenceRouter.post(
  '/evidence-packs',
  adminAuthenticate,
  adminAuthorize('compliance.evidencePack.generate'),
  validate({ body: evidencePackCreateSchema }),
  asyncHandler(evidenceAdminController.createPack),
);

adminEvidenceRouter.get(
  '/evidence-packs',
  adminAuthenticate,
  adminAuthorize('compliance.evidencePack.view'),
  validate({ query: evidencePackQuerySchema }),
  asyncHandler(evidenceAdminController.listPacks),
);

adminEvidenceRouter.get(
  '/evidence-packs/:packId',
  adminAuthenticate,
  adminAuthorize('compliance.evidencePack.view'),
  asyncHandler(evidenceAdminController.getPack),
);

adminEvidenceRouter.get(
  '/evidence-packs/:packId/export',
  adminAuthenticate,
  adminAuthorize('compliance.evidencePack.export'),
  asyncHandler(evidenceAdminController.exportPack),
);

// ---- record retention ----
adminEvidenceRouter.get(
  '/retention/policies',
  adminAuthenticate,
  adminAuthorize('compliance.retention.view'),
  asyncHandler(evidenceAdminController.listPolicies),
);

adminEvidenceRouter.post(
  '/retention/policies',
  adminAuthenticate,
  adminAuthorize('compliance.retention.manage'),
  validate({ body: retentionPolicySchema }),
  asyncHandler(evidenceAdminController.upsertPolicy),
);

adminEvidenceRouter.get(
  '/retention/reviews',
  adminAuthenticate,
  adminAuthorize('compliance.retention.view'),
  validate({ query: retentionReviewQuerySchema }),
  asyncHandler(evidenceAdminController.listReviews),
);

adminEvidenceRouter.post(
  '/retention/reviews/:reviewId/status',
  adminAuthenticate,
  adminAuthorize('compliance.retention.manage'),
  validate({ body: retentionReviewStatusSchema }),
  asyncHandler(evidenceAdminController.setReviewStatus),
);

// ---- export events ----
adminEvidenceRouter.get(
  '/exports/events',
  adminAuthenticate,
  adminAuthorize('compliance.exportEvent.view'),
  validate({ query: exportEventsQuerySchema }),
  asyncHandler(evidenceAdminController.listExportEvents),
);
