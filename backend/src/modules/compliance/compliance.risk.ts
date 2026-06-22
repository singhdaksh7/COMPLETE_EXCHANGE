import type {
  ComplianceRiskLevel,
  LivenessStatus,
  ScreeningStatus,
} from '@prisma/client';

/**
 * Rule-based customer risk scoring (Stage 5.0).
 *
 * A pure, deterministic function: given the compliance signals for a user it
 * returns a 0–100 score, a risk LEVEL, and the human-readable REASONS that
 * produced it. No IO, no secrets — fully unit-testable. This is an initial
 * heuristic baseline, NOT a substitute for real AML/CFT screening.
 */

export type RiskAdminFlag = 'NONE' | 'HIGH' | 'PROHIBITED';

export interface RiskScoreInput {
  countryOfResidence: string | null;
  nationality: string | null;
  hasPan: boolean;
  hasAadhaar: boolean;
  livenessStatus: LivenessStatus;
  sanctionsStatus: ScreeningStatus;
  pepStatus: ScreeningStatus;
  adverseMediaStatus: ScreeningStatus;
  /** Count of prior REJECTED compliance reviews for this user. */
  rejectionCount: number;
  adminFlag: RiskAdminFlag;
  geoCaptured: boolean;
  /**
   * Count of currently-open HIGH/CRITICAL compliance monitoring cases (Stage
   * 5.2). Optional + defaults to 0 so existing call sites/tests are unaffected.
   * Closed cases are excluded by the caller, so a resolved case stops adding
   * risk automatically.
   */
  openHighRiskCaseCount?: number;
}

export interface RiskScoreConfig {
  requireLiveness: boolean;
  requireSanctionsBeforeApproval: boolean;
  defaultRiskLevel: ComplianceRiskLevel;
}

export interface RiskReason {
  code: string;
  message: string;
  weight: number;
}

export interface RiskScoreResult {
  score: number;
  level: ComplianceRiskLevel;
  reasons: RiskReason[];
}

/**
 * Countries on the FATF "call for action" list (highest risk). ISO-3166 alpha-2.
 * Deliberately small + explicit; this is a placeholder list to be replaced by a
 * maintained screening dataset. Grey-list handling is left to real screening.
 */
const PROHIBITED_COUNTRIES = new Set(['KP', 'IR']); // DPRK, Iran
const HIGH_RISK_COUNTRIES = new Set(['MM', 'SY', 'AF', 'YE']); // illustrative

function norm(country: string | null): string | null {
  return country ? country.trim().toUpperCase() : null;
}

export function scoreCustomerRisk(
  input: RiskScoreInput,
  cfg: RiskScoreConfig,
): RiskScoreResult {
  const reasons: RiskReason[] = [];
  let score = 0;
  let forceProhibited = false;

  const add = (code: string, message: string, weight: number): void => {
    reasons.push({ code, message, weight });
    score += weight;
  };

  // --- Hard blocks -----------------------------------------------------------
  if (input.adminFlag === 'PROHIBITED') {
    forceProhibited = true;
    add('ADMIN_PROHIBITED', 'Manually flagged PROHIBITED by an administrator', 100);
  }
  if (input.sanctionsStatus === 'HIT') {
    forceProhibited = true;
    add('SANCTIONS_HIT', 'Sanctions screening returned a positive hit', 100);
  }
  if (input.livenessStatus === 'FAILED') {
    forceProhibited = true;
    add('LIVENESS_FAILED', 'Liveness check failed', 60);
  }

  // --- Geography -------------------------------------------------------------
  const country = norm(input.countryOfResidence);
  if (!country) {
    add('MISSING_COUNTRY', 'Country of residence is missing', 25);
  } else if (PROHIBITED_COUNTRIES.has(country)) {
    forceProhibited = true;
    add('PROHIBITED_COUNTRY', `Country of residence ${country} is prohibited`, 100);
  } else if (HIGH_RISK_COUNTRIES.has(country)) {
    add('HIGH_RISK_COUNTRY', `Country of residence ${country} is high-risk`, 40);
  }

  // --- Identity completeness -------------------------------------------------
  if (!input.hasPan) add('MISSING_PAN', 'PAN not provided', 20);
  if (!input.hasAadhaar) add('MISSING_AADHAAR', 'Aadhaar reference not provided', 10);

  // --- Behavioural -----------------------------------------------------------
  if (input.rejectionCount >= 2) {
    add('REPEATED_REJECTION', `${input.rejectionCount} prior KYC rejections`, 25);
  } else if (input.rejectionCount === 1) {
    add('PRIOR_REJECTION', 'One prior KYC rejection', 10);
  }

  // --- Admin signal (non-terminal) ------------------------------------------
  if (input.adminFlag === 'HIGH') {
    add('ADMIN_HIGH_RISK', 'Manually flagged HIGH risk by an administrator', 50);
  }

  // --- Monitoring cases (Stage 5.2) -----------------------------------------
  // Each open HIGH/CRITICAL suspicious-transaction case raises risk; capped so
  // it elevates but never alone forces PROHIBITED. Closed cases are excluded by
  // the caller, so resolving a case removes its contribution on next recompute.
  const openCases = input.openHighRiskCaseCount ?? 0;
  if (openCases > 0) {
    add(
      'OPEN_COMPLIANCE_CASE',
      `${openCases} open HIGH/CRITICAL compliance case(s)`,
      Math.min(40, openCases * 25),
    );
  }

  // --- Screening signals -----------------------------------------------------
  if (input.pepStatus === 'HIT') {
    add('PEP_HIT', 'Politically Exposed Person match', 40);
  }
  if (input.adverseMediaStatus === 'HIT') {
    add('ADVERSE_MEDIA', 'Adverse media match', 20);
  }
  // Possible (unconfirmed) screening matches — REVIEW_REQUIRED is the posture
  // written by the screening layer for a POSSIBLE_MATCH / FAILED / ERROR that an
  // admin has not yet resolved. These raise risk but never hard-block on their
  // own (a confirmed hit is recorded as HIT above and handled there).
  if (input.sanctionsStatus === 'REVIEW_REQUIRED') {
    add('SANCTIONS_REVIEW', 'Possible sanctions match needs review', 50);
  }
  if (input.pepStatus === 'REVIEW_REQUIRED') {
    add('PEP_REVIEW', 'Possible PEP match needs review', 30);
  }
  if (input.adverseMediaStatus === 'REVIEW_REQUIRED') {
    add('ADVERSE_MEDIA_REVIEW', 'Possible adverse-media match needs review', 15);
  }
  if (cfg.requireSanctionsBeforeApproval && input.sanctionsStatus === 'NOT_SCREENED') {
    add('SANCTIONS_NOT_SCREENED', 'Sanctions screening required but not completed', 15);
  }

  // --- Liveness (non-terminal) ----------------------------------------------
  if (input.livenessStatus === 'REVIEW_REQUIRED') {
    add('LIVENESS_REVIEW', 'Liveness check needs manual review', 20);
  } else if (
    cfg.requireLiveness &&
    (input.livenessStatus === 'NOT_STARTED' || input.livenessStatus === 'PENDING')
  ) {
    add('LIVENESS_INCOMPLETE', 'Liveness required but not completed', 15);
  }

  // --- Minor signals ---------------------------------------------------------
  if (!input.geoCaptured) {
    add('GEO_NOT_CAPTURED', 'Onboarding geo/IP evidence was not captured', 5);
  }

  score = Math.max(0, Math.min(100, score));

  let level: ComplianceRiskLevel;
  if (forceProhibited) {
    level = 'PROHIBITED';
  } else if (reasons.length === 0) {
    level = cfg.defaultRiskLevel;
  } else if (score >= 75) {
    level = 'PROHIBITED';
  } else if (score >= 50) {
    level = 'HIGH';
  } else if (score >= 20) {
    level = 'MEDIUM';
  } else {
    level = 'LOW';
  }

  return { score, level, reasons };
}
