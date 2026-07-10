/** Backend base URLs. Override via .env.local (NEXT_PUBLIC_*). */
export const USER_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const ADMIN_API_URL =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:4001/admin/v1';

/**
 * Stage 7B — when 'true', the login screen REQUIRES browser geolocation before
 * sign-in (denial blocks login). Must mirror the backend REQUIRE_LOGIN_LOCATION
 * flag. Default off keeps login working for browsers that block location; the
 * backend independently enforces its own flag regardless of this value.
 */
export const REQUIRE_LOGIN_LOCATION =
  process.env.NEXT_PUBLIC_REQUIRE_LOGIN_LOCATION === 'true';

/**
 * Stage 9A — feature visibility flags for INR-only audit/demo mode. These are
 * frontend-only display gates (no backend module exists for either feature); the
 * UI hides the entry points and any direct route renders an "unavailable" notice.
 * Kept OFF until compliance/product approval. Override via NEXT_PUBLIC_* if ever
 * re-enabled for internal use.
 */
export const API_MANAGEMENT_ENABLED =
  process.env.NEXT_PUBLIC_API_MANAGEMENT_ENABLED === 'true';

export const REFERRALS_ENABLED =
  process.env.NEXT_PUBLIC_REFERRALS_ENABLED === 'true';

/**
 * Stage 12 — Google sign-in via Firebase Authentication (federated identity
 * layer only; EXORA remains authoritative for sessions — see
 * backend/auth.federated.service.ts). Default OFF. The operator has not
 * provisioned a Firebase project yet; even when this flag is flipped true,
 * `isGoogleAuthAvailable()` (lib/firebase.ts) also requires every
 * NEXT_PUBLIC_FIREBASE_* value below to be present before showing the button.
 */
export const GOOGLE_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';

/** Firebase web client config — public values, not secrets. */
export const FIREBASE_CONFIG = (() => {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
})();
