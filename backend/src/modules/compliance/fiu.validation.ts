import type { FiuValidationSeverity } from '@prisma/client';

/**
 * Pure FIU draft-report validation (Stage 5.6). Produces INFO/WARNING/ERROR
 * findings for missing/invalid required draft fields. No IO. A report may move
 * to READY_FOR_INTERNAL_REVIEW only when there are zero ERROR findings.
 */

export interface ValidationIssue {
  severity: FiuValidationSeverity;
  code: string;
  field?: string;
  message: string;
}

export interface ValidationContext {
  reportType: string;
  scopeType: string;
  scopeUserId: string | null;
  scopeCaseId: string | null;
  evidencePackId: string | null;
  narrative: string | null;
  generatedByAdminId: string | null;
  hasProfileItem: boolean;
  hasCaseItem: boolean;
  hasTransactionRefs: boolean;
  /** Serialized payload — scanned for accidental unmasked sensitive data. */
  payloadString: string;
}

const RAW_PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/; // unmasked PAN pattern
const RAW_AADHAAR_RE = /\b[0-9]{12}\b/; // unmasked 12-digit Aadhaar pattern
const SECRET_KEY_RE = /"(password|passwordHash|totpSecret\w*|jwtSecret|privateKey|databaseUrl|panEnc|aadhaarRefEnc)"\s*:/i;

const NARRATIVE_REQUIRED_TYPES = new Set(['STR', 'INTERNAL_SUSPICIOUS_ACTIVITY_SUMMARY']);

export function validateDraft(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!ctx.scopeUserId && (ctx.scopeType === 'USER' || ctx.scopeType === 'CASE')) {
    issues.push({ severity: 'ERROR', code: 'MISSING_SUBJECT_USER', field: 'scopeUserId', message: 'No subject user resolved for this report scope.' });
  }

  if (!ctx.narrative || ctx.narrative.trim().length === 0) {
    issues.push({
      severity: NARRATIVE_REQUIRED_TYPES.has(ctx.reportType) ? 'ERROR' : 'WARNING',
      code: 'MISSING_NARRATIVE',
      field: 'narrative',
      message: 'Suspicious reason / narrative is missing.',
    });
  }

  if (ctx.scopeType === 'CASE' && !ctx.scopeCaseId) {
    issues.push({ severity: 'ERROR', code: 'MISSING_CASE_REFERENCE', field: 'scopeCaseId', message: 'Case-scoped report has no case reference.' });
  }

  if (!ctx.hasTransactionRefs && (ctx.reportType === 'CTR' || ctx.reportType === 'NTR')) {
    issues.push({ severity: 'WARNING', code: 'MISSING_TRANSACTION_REFS', message: 'No transaction references found for a transaction-based report.' });
  }

  if (!ctx.hasProfileItem) {
    issues.push({ severity: 'WARNING', code: 'MISSING_KYC_PROFILE', message: 'No KYC/compliance profile snapshot is included.' });
  }

  if (!ctx.generatedByAdminId) {
    issues.push({ severity: 'WARNING', code: 'MISSING_GENERATED_BY', field: 'generatedByAdminId', message: 'Report has no generating admin user recorded.' });
  }

  if (!ctx.evidencePackId) {
    issues.push({ severity: 'INFO', code: 'NO_EVIDENCE_PACK', field: 'evidencePackId', message: 'Report was generated without an evidence-pack reference.' });
  }

  if (RAW_PAN_RE.test(ctx.payloadString) || RAW_AADHAAR_RE.test(ctx.payloadString) || SECRET_KEY_RE.test(ctx.payloadString)) {
    issues.push({ severity: 'ERROR', code: 'UNMASKED_SENSITIVE_DATA', message: 'Potential unmasked sensitive data / secret detected in the report payload.' });
  }

  return issues;
}

export function countSeverities(issues: ValidationIssue[]): { errorCount: number; warningCount: number; infoCount: number } {
  return {
    errorCount: issues.filter((i) => i.severity === 'ERROR').length,
    warningCount: issues.filter((i) => i.severity === 'WARNING').length,
    infoCount: issues.filter((i) => i.severity === 'INFO').length,
  };
}
