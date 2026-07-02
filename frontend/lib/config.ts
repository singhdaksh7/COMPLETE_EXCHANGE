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
