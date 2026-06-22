import { describe, it, expect } from 'vitest';
import { validateDraft, countSeverities, type ValidationContext } from '../../src/modules/compliance/fiu.validation';

function base(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    reportType: 'STR',
    scopeType: 'CASE',
    scopeUserId: 'user-1',
    scopeCaseId: 'case-1',
    evidencePackId: 'pack-1',
    narrative: 'Suspicious layering pattern observed.',
    generatedByAdminId: 'admin-1',
    hasProfileItem: true,
    hasCaseItem: true,
    hasTransactionRefs: true,
    payloadString: '{"items":[{"panMasked":"ABCDE****F"}]}',
    ...over,
  };
}

describe('validateDraft', () => {
  it('a complete STR draft has no ERROR issues', () => {
    const issues = validateDraft(base());
    expect(issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0);
  });

  it('flags a missing subject user as ERROR', () => {
    const issues = validateDraft(base({ scopeUserId: null }));
    expect(issues.some((i) => i.code === 'MISSING_SUBJECT_USER' && i.severity === 'ERROR')).toBe(true);
  });

  it('a missing narrative is an ERROR for STR', () => {
    const issues = validateDraft(base({ narrative: '' }));
    expect(issues.some((i) => i.code === 'MISSING_NARRATIVE' && i.severity === 'ERROR')).toBe(true);
  });

  it('a missing narrative is only a WARNING for CTR', () => {
    const issues = validateDraft(base({ reportType: 'CTR', narrative: null }));
    const n = issues.find((i) => i.code === 'MISSING_NARRATIVE');
    expect(n?.severity).toBe('WARNING');
  });

  it('flags a case-scoped report with no case reference', () => {
    const issues = validateDraft(base({ scopeCaseId: null }));
    expect(issues.some((i) => i.code === 'MISSING_CASE_REFERENCE' && i.severity === 'ERROR')).toBe(true);
  });

  it('warns on missing KYC profile and missing generatedBy', () => {
    const issues = validateDraft(base({ hasProfileItem: false, generatedByAdminId: null }));
    expect(issues.some((i) => i.code === 'MISSING_KYC_PROFILE' && i.severity === 'WARNING')).toBe(true);
    expect(issues.some((i) => i.code === 'MISSING_GENERATED_BY' && i.severity === 'WARNING')).toBe(true);
  });

  it('INFO when no evidence pack reference', () => {
    const issues = validateDraft(base({ evidencePackId: null }));
    expect(issues.some((i) => i.code === 'NO_EVIDENCE_PACK' && i.severity === 'INFO')).toBe(true);
  });

  it('ERROR when unmasked PAN/Aadhaar or a secret key leaks into the payload', () => {
    expect(validateDraft(base({ payloadString: '{"pan":"ABCDE1234F"}' })).some((i) => i.code === 'UNMASKED_SENSITIVE_DATA')).toBe(true);
    expect(validateDraft(base({ payloadString: '{"aadhaar":"123412341234"}' })).some((i) => i.code === 'UNMASKED_SENSITIVE_DATA')).toBe(true);
    expect(validateDraft(base({ payloadString: '{"passwordHash":"x"}' })).some((i) => i.code === 'UNMASKED_SENSITIVE_DATA')).toBe(true);
  });
});

describe('countSeverities', () => {
  it('counts each severity', () => {
    const c = countSeverities([
      { severity: 'ERROR', code: 'a', message: '' },
      { severity: 'WARNING', code: 'b', message: '' },
      { severity: 'WARNING', code: 'c', message: '' },
      { severity: 'INFO', code: 'd', message: '' },
    ]);
    expect(c).toEqual({ errorCount: 1, warningCount: 2, infoCount: 1 });
  });
});
