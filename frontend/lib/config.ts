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
