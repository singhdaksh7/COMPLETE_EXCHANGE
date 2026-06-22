import { z } from 'zod';

const DOC_TYPE = z.enum(['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'RISK_DISCLOSURE', 'AML_POLICY_NOTICE', 'FEE_POLICY', 'TAX_DISCLOSURE']);

export const legalAcceptSchema = z.object({
  documentType: DOC_TYPE,
  version: z.string().max(40).optional(),
});

export const legalDocumentCreateSchema = z.object({
  type: DOC_TYPE,
  version: z.string().min(1).max(40),
  title: z.string().min(2).max(200),
  content: z.string().min(1).max(100000),
});

export const legalDocsQuerySchema = z.object({
  type: DOC_TYPE.optional(),
});

export const legalAcceptancesQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  documentType: DOC_TYPE.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type LegalAcceptDto = z.infer<typeof legalAcceptSchema>;
export type LegalDocumentCreateDto = z.infer<typeof legalDocumentCreateSchema>;
export type LegalAcceptancesQueryDto = z.infer<typeof legalAcceptancesQuerySchema>;
