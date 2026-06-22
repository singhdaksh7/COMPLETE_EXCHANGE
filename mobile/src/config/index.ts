/**
 * App configuration. The API base URL comes from an environment variable so the
 * same build can target staging / local without code changes. Only EXPO_PUBLIC_*
 * vars are inlined into the bundle — never put secrets here. The mobile app only
 * ever talks to the PUBLIC user API; it has no admin/compliance surface.
 */

const DEFAULT_API_URL = 'https://dfk68tws8g8oj.cloudfront.net/api/v1';

export const config = {
  /** Public user API base, e.g. https://<host>/api/v1 */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/$/, ''),
  /** Honest staging banner — this is a demo build against the staging CEX. */
  isStaging: true,
  appName: 'EXORA',
} as const;
