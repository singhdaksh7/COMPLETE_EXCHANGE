/**
 * Production safety guards (Stage 4.2).
 *
 * Staging runs the prod build with NODE_ENV=production but intentionally uses
 * offline/mock services (mock chain providers, mock withdrawal signer, the
 * 'log' mail provider) and may run admins without TOTP. To prevent a REAL
 * production deployment from silently inheriting those unsafe staging toggles,
 * each unsafe-in-production toggle must be explicitly acknowledged via a
 * clearly-named `ALLOW_*` override. Without the override, the process refuses
 * to boot (env-level checks) or refuses the action (admin-login check).
 *
 * These helpers are PURE (no I/O, no singletons) so they are trivially unit
 * tested and are reused by both the env schema and the admin auth flow.
 */

export interface SafetyIssue {
  /** The env var most responsible for the issue (used as the Zod issue path). */
  path: string;
  message: string;
}

export interface ProdSafetyInput {
  nodeEnv: string;
  // Offline/mock service selectors.
  tronProvider: string;
  bscProvider: string;
  priceProvider: string;
  razorpayProvider: string;
  kycProvider: string;
  withdrawalSigner: string;
  mailProvider: string;
  requireEmailVerification: boolean;
  // Stage 13 temporary login-gate bypass: lets unverified-email accounts log in
  // while SES approval is pending. Unlike the toggles below it has NO override —
  // it must never be true in a real production deployment.
  allowUnverifiedLogin: boolean;
  // Explicit, clearly-named acknowledgements (staging sets these to true).
  allowMockProviders: boolean;
  allowMockWithdrawalSigner: boolean;
  allowLogMailProvider: boolean;
  allowUnverifiedEmailLogin: boolean;
}

const OVERRIDE_HINT = (flag: string) =>
  `set ${flag}=true to acknowledge this is a staging/demo deployment`;

/**
 * Returns the list of production-safety violations for a given config. Empty
 * when NODE_ENV !== 'production' (the guards only apply to production builds)
 * or when every unsafe toggle is explicitly acknowledged.
 */
export function productionSafetyIssues(input: ProdSafetyInput): SafetyIssue[] {
  if (input.nodeEnv !== 'production') return [];
  const issues: SafetyIssue[] = [];

  // 1. Mock chain / price / payment / KYC providers — no real detection,
  //    pricing, settlement, or identity verification happens with these.
  const mockProviders: Array<[string, string]> = [
    ['TRON_PROVIDER', input.tronProvider],
    ['BSC_PROVIDER', input.bscProvider],
    ['PRICE_PROVIDER', input.priceProvider],
    ['RAZORPAY_PROVIDER', input.razorpayProvider],
    ['KYC_PROVIDER', input.kycProvider],
  ];
  if (!input.allowMockProviders) {
    for (const [key, value] of mockProviders) {
      if (value === 'mock') {
        issues.push({
          path: key,
          message: `${key}=mock is unsafe in production — ${OVERRIDE_HINT('ALLOW_MOCK_PROVIDERS')}`,
        });
      }
    }
  }

  // 2. Mock withdrawal signer — performs NO real signing/broadcast. Live
  //    signing is intentionally unimplemented, so mock is the only working
  //    mode; production must still acknowledge it explicitly.
  if (input.withdrawalSigner === 'mock' && !input.allowMockWithdrawalSigner) {
    issues.push({
      path: 'WITHDRAWAL_SIGNER',
      message: `WITHDRAWAL_SIGNER=mock is unsafe in production — ${OVERRIDE_HINT('ALLOW_MOCK_WITHDRAWAL_SIGNER')}`,
    });
  }

  // 3. 'log' mail provider — sends NO real email (offline outbox only).
  if (input.mailProvider === 'log' && !input.allowLogMailProvider) {
    issues.push({
      path: 'MAIL_PROVIDER',
      message: `MAIL_PROVIDER=log sends no real email in production — set MAIL_PROVIDER=ses, or ${OVERRIDE_HINT('ALLOW_LOG_MAIL_PROVIDER')}`,
    });
  }

  // 4. Email verification disabled — lets unverified accounts log in.
  if (!input.requireEmailVerification && !input.allowUnverifiedEmailLogin) {
    issues.push({
      path: 'REQUIRE_EMAIL_VERIFICATION',
      message: `REQUIRE_EMAIL_VERIFICATION=false is unsafe in production — ${OVERRIDE_HINT('ALLOW_UNVERIFIED_EMAIL_LOGIN')}`,
    });
  }

  // 5. Stage 13 login-gate bypass — must NEVER be on in production. There is no
  //    override: a real deployment serves only verified accounts.
  if (input.allowUnverifiedLogin) {
    issues.push({
      path: 'ALLOW_UNVERIFIED_LOGIN',
      message:
        'ALLOW_UNVERIFIED_LOGIN=true (Stage 13 email-verification bypass) is unsafe in production and has no override — set it to false',
    });
  }

  return issues;
}

/**
 * Whether an admin whose TOTP is NOT enabled must be blocked from logging in.
 * In production a real second factor is required; the only escape hatch is the
 * explicit ALLOW_ADMIN_LOGIN_WITHOUT_TOTP staging override (e.g. to bootstrap
 * the first admin before enrollment).
 */
export function adminTotpRequired(input: {
  isProd: boolean;
  totpEnabled: boolean;
  allowOverride: boolean;
}): boolean {
  if (input.totpEnabled) return false;
  if (!input.isProd) return false;
  return !input.allowOverride;
}
