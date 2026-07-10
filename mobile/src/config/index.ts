/**
 * App configuration. The API base URL comes from an environment variable so the
 * same build can target staging / local without code changes. Only EXPO_PUBLIC_*
 * vars are inlined into the bundle — never put secrets here. The mobile app only
 * ever talks to the PUBLIC user API; it has no admin/compliance surface.
 */

const DEFAULT_API_URL = 'https://dfk68tws8g8oj.cloudfront.net/api/v1';

/**
 * Stage 12 — Google/Apple sign-in via Firebase Authentication (federated
 * identity verification layer only; EXORA remains authoritative for sessions
 * — see backend auth.federated.service.ts). Every flag below defaults OFF:
 * the operator has not provisioned a Firebase project, Google OAuth client,
 * or Apple capability yet. A button only renders once BOTH its flag AND its
 * full config are present — never a dead/disabled button.
 */
const firebaseConfig = (() => {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
})();

export const config = {
  /** Public user API base, e.g. https://<host>/api/v1 */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/$/, ''),
  /** Honest staging banner — this is a demo build against the staging CEX. */
  isStaging: true,
  appName: 'EXORA',

  federatedAuth: {
    googleEnabled: process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === 'true',
    // Apple Sign-In is iOS-only regardless of this flag (enforced at the
    // platform-availability check, not just here).
    appleEnabled: process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED === 'true',
    firebase: firebaseConfig,
    // "Web client ID" (the OAuth client Firebase auto-creates for a Google
    // project) — required by @react-native-google-signin/google-signin on
    // BOTH Android and iOS to obtain a Firebase-verifiable Google ID token.
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    // Optional override; only needed on iOS when GoogleService-Info.plist is
    // absent (it is, for now — the operator hasn't supplied it).
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  },
} as const;
