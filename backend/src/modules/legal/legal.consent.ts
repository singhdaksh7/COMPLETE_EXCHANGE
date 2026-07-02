import type { LegalDocumentType } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../lib/errors';
import { legalRepository } from './legal.repository';

/**
 * Stage 9A — signup / financial-action legal consent.
 *
 * Reuses the existing versioned legal-acceptance system (`UserLegalAcceptance`,
 * `legalService`). These are the document types a user must have a current,
 * non-revoked ACCEPTED record for before financial actions (KYC / deposit /
 * withdrawal / trading) are allowed. Captured at signup and re-offered via the
 * post-login consent banner for existing users.
 */
export const REQUIRED_SIGNUP_POLICIES: LegalDocumentType[] = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'RISK_DISCLOSURE',
];

/**
 * Whether the consent gate is enforced. Enforced by default; ops can disable it
 * for the staging demo by setting REQUIRE_POLICY_CONSENT=false (e.g. if legacy
 * test users without acceptances must keep flowing). Capture at signup happens
 * regardless of this flag.
 */
export function isConsentEnforced(): boolean {
  return process.env.REQUIRE_POLICY_CONSENT !== 'false';
}

/** Doc types the user currently has an ACCEPTED (non-revoked) acceptance for. */
export async function acceptedPolicyTypes(userId: string): Promise<Set<string>> {
  const rows = await legalRepository.listAcceptancesForUser(userId);
  const accepted = new Set<string>();
  for (const r of rows) {
    if (r.status === 'ACCEPTED' && !r.revokedAt) accepted.add(r.documentType);
  }
  return accepted;
}

/** Required policy types the user has NOT yet accepted. */
export async function missingRequiredPolicies(userId: string): Promise<LegalDocumentType[]> {
  const accepted = await acceptedPolicyTypes(userId);
  return REQUIRED_SIGNUP_POLICIES.filter((t) => !accepted.has(t));
}

/**
 * Express guard: block a financial action until the user has accepted every
 * required policy. Returns 403 CONSENT_REQUIRED with the missing types so the
 * frontend banner can prompt for them. No-op when enforcement is disabled.
 */
export async function requireLegalConsent(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!isConsentEnforced()) return next();
    if (!req.user) throw new UnauthorizedError();
    const missing = await missingRequiredPolicies(req.user.id);
    if (missing.length > 0) {
      throw new ForbiddenError(
        'You must accept the current Terms, Privacy Policy and Risk Disclosure to continue.',
        'CONSENT_REQUIRED',
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}
