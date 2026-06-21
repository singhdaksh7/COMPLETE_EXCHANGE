import { z } from 'zod';

/**
 * Zod schemas for the compliance / enhanced-KYC surface. The validate()
 * middleware rejects anything malformed before it reaches the service.
 */

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const AADHAAR_RE = /^[0-9]{12}$/;

const addressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(3).max(20),
  country: z.string().min(2).max(100),
});

/** All four/five consents must be explicitly accepted (true). */
const consentsSchema = z
  .object({
    kycProcessing: z.literal(true),
    amlScreening: z.literal(true),
    dataRetention: z.literal(true),
    termsAccepted: z.literal(true),
    riskDisclosure: z.literal(true),
  })
  .strict();

export const submitEnhancedKycSchema = z.object({
  customerType: z.enum(['INDIVIDUAL', 'BUSINESS']).default('INDIVIDUAL'),
  fullName: z.string().min(2).max(140),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  nationality: z.string().min(2).max(100),
  countryOfResidence: z.string().min(2).max(100),
  address: addressSchema,
  // Raw values are masked + (optionally) encrypted server-side and NEVER echoed.
  pan: z.string().regex(PAN_RE, 'Invalid PAN format'),
  aadhaar: z.string().regex(AADHAAR_RE, 'Aadhaar must be 12 digits').optional(),
  consents: consentsSchema,
});

export const livenessStartSchema = z.object({}).optional();

export const livenessVerifySchema = z.object({
  providerReference: z.string().min(6).max(120),
  sessionId: z.string().min(6).max(120).optional(),
  // STAGING/MOCK ONLY — lets the client drive a non-happy outcome for testing.
  simulateOutcome: z.enum(['PASSED', 'FAILED', 'REVIEW_REQUIRED']).optional(),
});

// ----- admin -----
export const complianceReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_INFO']),
  reason: z.string().min(1).max(1000).optional(),
  complianceNote: z.string().max(2000).optional(),
  nextReviewInDays: z.coerce.number().int().min(1).max(3650).optional(),
});

export const complianceRiskSchema = z.object({
  level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'PROHIBITED']),
  reason: z.string().max(1000).optional(),
  score: z.coerce.number().int().min(0).max(100).optional(),
});

export const complianceQuerySchema = z.object({
  status: z
    .enum([
      'NOT_STARTED',
      'DRAFT',
      'SUBMITTED',
      'NEEDS_MORE_INFO',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'EXPIRED',
    ])
    .optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'PROHIBITED']).optional(),
  email: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SubmitEnhancedKycDto = z.infer<typeof submitEnhancedKycSchema>;
export type LivenessVerifyDto = z.infer<typeof livenessVerifySchema>;
export type ComplianceReviewDto = z.infer<typeof complianceReviewSchema>;
export type ComplianceRiskDto = z.infer<typeof complianceRiskSchema>;
export type ComplianceQueryDto = z.infer<typeof complianceQuerySchema>;
