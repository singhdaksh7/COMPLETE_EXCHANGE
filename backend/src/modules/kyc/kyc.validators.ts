import { z } from 'zod';
import { KycDocType, KycStatus, RiskLevel, UserStatus } from '@prisma/client';

/**
 * zod schemas = the single source of validation truth for the KYC module.
 * Mirrors the OpenAPI request shapes (KycSubmitRequest, KycDocumentRequest,
 * KycDecisionRequest) and rejects unknown fields at the edge.
 */
const pan = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN');

/**
 * Reject angle brackets in human-identity / free-text fields that are later
 * rendered in the admin console and (for reason messages) to the user. Names,
 * addresses and reasons never legitimately contain `<`/`>`, so rejecting them
 * outright is a clean store-side XSS guard (defense in depth on top of the
 * frontend's output escaping). Applied via `.refine` so the trimmed value is
 * validated and the original text is preserved otherwise.
 */
const noAngleBrackets = (schema: z.ZodString) =>
  schema.refine((v) => !/[<>]/.test(v), {
    message: 'Must not contain HTML tags (< or >)',
  });

const addressSchema = z
  .object({
    line1: noAngleBrackets(z.string().trim().max(200)).optional(),
    line2: noAngleBrackets(z.string().trim().max(200)).optional(),
    city: noAngleBrackets(z.string().trim().max(100)).optional(),
    state: noAngleBrackets(z.string().trim().max(100)).optional(),
    pincode: z
      .string()
      .regex(/^[1-9][0-9]{5}$/, 'Invalid pincode')
      .optional(),
  })
  .strict();

export const kycSubmitSchema = z
  .object({
    fullName: noAngleBrackets(z.string().trim().min(2).max(140)),
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date of birth (YYYY-MM-DD)')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date of birth'),
    pan,
    // Tokenized Aadhaar reference, never the raw 12-digit number.
    aadhaarRef: z.string().trim().min(8).max(256).optional(),
    address: addressSchema.optional(),
  })
  .strict();

/**
 * The ONLY MIME types a KYC document upload may declare. This is a strict
 * allowlist: anything outside it (executables, scripts, archives, HTML, SVG,
 * or unknown types) is rejected at the edge. SVG is intentionally excluded
 * because it can carry active script content. Kept as an exported constant so
 * the service layer can re-assert the same rule (defense in depth).
 */
export const ALLOWED_KYC_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

export const kycDocumentSchema = z
  .object({
    docType: z.nativeEnum(KycDocType),
    sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid sha256 digest'),
    contentType: z.enum(ALLOWED_KYC_MIME_TYPES, {
      errorMap: () => ({
        message: `Unsupported file type. Allowed types: ${ALLOWED_KYC_MIME_TYPES.join(', ')}`,
      }),
    }),
    // Declared file size in bytes. Optional for backwards compatibility with
    // existing clients, but when present it must be a positive integer; the
    // configured maximum (KYC_MAX_UPLOAD_BYTES) is enforced server-side in the
    // service before a presigned upload URL is issued.
    fileSize: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const kycDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_INFO']),
    tier: z.number().int().min(0).max(5).optional(),
    // User-facing reason/message (safe to show the user). Required for REJECT
    // and REQUEST_INFO.
    reason: noAngleBrackets(z.string().trim().max(500)).optional(),
    // Internal compliance note (admin-only, never returned on user APIs).
    complianceNote: noAngleBrackets(z.string().trim().max(1000)).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.decision === 'APPROVE' ||
      (v.reason !== undefined && v.reason.length > 0),
    { message: 'reason is required when rejecting or requesting more info', path: ['reason'] },
  );

/** Standalone internal compliance note (no status change). */
export const kycNoteSchema = z
  .object({ note: noAngleBrackets(z.string().trim().min(1).max(1000)) })
  .strict();

export const kycQueueQuerySchema = z
  .object({
    cursor: z.string().uuid('Invalid cursor').optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.nativeEnum(KycStatus).optional(),
    email: z.string().trim().min(1).max(256).optional(),
    riskLevel: z.nativeEnum(RiskLevel).optional(),
    accountStatus: z.nativeEnum(UserStatus).optional(),
    submittedFrom: z.coerce.date().optional(),
    submittedTo: z.coerce.date().optional(),
  })
  .strict();

export const userIdParamSchema = z
  .object({ userId: z.string().uuid('Invalid user id') })
  .strict();

export type KycSubmitDto = z.infer<typeof kycSubmitSchema>;
export type KycDocumentDto = z.infer<typeof kycDocumentSchema>;
export type KycDecisionDto = z.infer<typeof kycDecisionSchema>;
export type KycNoteDto = z.infer<typeof kycNoteSchema>;
export type KycQueueQueryDto = z.infer<typeof kycQueueQuerySchema>;
