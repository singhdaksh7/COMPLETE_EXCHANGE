import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  type Auth,
} from 'firebase/auth';
import { FIREBASE_CONFIG, GOOGLE_AUTH_ENABLED } from './config';

/**
 * Firebase client (Stage 12) — a verification layer only. This module NEVER
 * talks to EXORA's own auth directly; it only obtains a Firebase ID token,
 * which the caller then posts to POST /auth/federated/firebase. EXORA remains
 * authoritative for sessions/tokens (see backend auth.federated.service.ts).
 *
 * Safe when unconfigured: every export here is a no-op/throws a clear error
 * until both the feature flag AND the full Firebase web config are present —
 * never a dead button, never a fake success.
 *
 * PERSISTENCE — deliberately `inMemoryPersistence` (Stage 12A security
 * review). Plain `getAuth()` on the web SDK defaults to
 * `browserLocalPersistence` (localStorage, survives reloads/new tabs) unless
 * told otherwise. This module only ever needs a FRESH Firebase ID token at
 * the moment a user clicks "Continue with Google"; nothing here reads
 * Firebase's persisted state (there is no `onAuthStateChanged` listener), so
 * letting Firebase silently keep a signed-in session in the browser would add
 * a second, unused credential store for no benefit. EXORA's own session
 * (access/refresh tokens from `tokenStore`) is the only thing that should
 * survive a reload — matches the same reviewed choice made in the mobile app.
 */

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;

function getFirebaseAuth(): Auth {
  if (!FIREBASE_CONFIG) {
    throw new Error('Firebase is not configured');
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
  }
  if (!authInstance) {
    try {
      authInstance = initializeAuth(app, {
        persistence: inMemoryPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      // Already initialized on this app instance (e.g. React Fast Refresh in
      // dev) — reuse whatever instance is already there.
      authInstance = getAuth(app);
    }
  }
  return authInstance;
}

/** Whether the "Continue with Google" button should render at all. */
export function isGoogleAuthAvailable(): boolean {
  return GOOGLE_AUTH_ENABLED && FIREBASE_CONFIG !== null;
}

/**
 * Sign in with Google via a Firebase popup and return the Firebase ID token.
 * Throws on user cancellation, popup blocking, or any Firebase error — the
 * caller shows a generic "Google sign-in failed" message, never a raw
 * Firebase error string.
 */
export async function signInWithGooglePopup(): Promise<string> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken();
}
