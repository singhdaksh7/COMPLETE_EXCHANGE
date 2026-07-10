import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  type Auth,
} from 'firebase/auth';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { config } from '@/config';

/**
 * Firebase client (Stage 12) — a verification layer only. This module NEVER
 * talks to EXORA's own auth directly; it only obtains a Firebase ID token,
 * which the caller then posts to POST /auth/federated/firebase. EXORA remains
 * authoritative for sessions/tokens (see backend auth.federated.service.ts).
 * The Firebase ID token is never persisted (not stored in SecureStore OR
 * AsyncStorage) — only the EXORA access/refresh tokens are, via `tokenStore`,
 * exactly as today.
 *
 * PERSISTENCE — deliberately `inMemoryPersistence` (Stage 12A security
 * review). Firebase's own web/RN SDK does NOT auto-detect AsyncStorage for a
 * plain `getAuth()` call — that only happens if `initializeAuth()` is given
 * `persistence: getReactNativePersistence(AsyncStorage)` explicitly (verified
 * against the installed `firebase` package's React Native build, which
 * otherwise falls back to in-memory and logs a warning). We keep it in-memory
 * on purpose rather than wiring AsyncStorage: this module only ever needs a
 * FRESH Firebase ID token at the moment a user taps Google/Apple, EXORA's own
 * session (SecureStore-backed) is the only thing that should survive an app
 * restart, and one fewer credential store on-device is one fewer thing to
 * secure. Concretely: after an app restart, or after EXORA's own session is
 * revoked (e.g. `SESSION_REVOKED_BY_NEW_LOGIN`), there is no persisted
 * Firebase state to silently resume from — the user must explicitly tap a
 * sign-in button again, which is the only thing that ever calls
 * `signInWithCredential` in this module (never on mount, never auto-retried).
 *
 * IMPORTANT — native module loading is deliberately DEFERRED (via `require()`
 * inside the functions below, not top-level `import`) for
 * `@react-native-google-signin/google-signin` and `expo-apple-authentication`.
 * Both packages register a native binding at module-load time; importing them
 * eagerly would crash the ENTIRE app on any binary that hasn't been rebuilt
 * with the native module linked yet (Phase 25 explicitly forbids a new EAS
 * build in this pass — code must be ready, the rebuild happens later). Because
 * the require() only runs when a user actually presses the (flag-gated)
 * button, the app stays crash-safe today and picks up the real module the
 * moment a rebuilt binary is installed — no code change needed then.
 */

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let googleConfigured = false;

function getFirebaseAuth(): Auth {
  if (!config.federatedAuth.firebase) {
    throw new Error('Firebase is not configured');
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(config.federatedAuth.firebase);
  }
  if (!authInstance) {
    try {
      authInstance = initializeAuth(app, { persistence: inMemoryPersistence });
    } catch {
      // Already initialized on this app instance (e.g. Fast Refresh in dev,
      // where this module reloads but the underlying Firebase app registry
      // survives) — reuse whatever instance is already there.
      authInstance = getAuth(app);
    }
  }
  return authInstance;
}

/** Whether the "Continue with Google" button should render at all. */
export function isGoogleAuthAvailable(): boolean {
  return (
    config.federatedAuth.googleEnabled &&
    config.federatedAuth.firebase !== null &&
    !!config.federatedAuth.googleWebClientId
  );
}

/** Cheap, synchronous half of the Apple availability check (platform + config). */
export function isAppleAuthConfigured(): boolean {
  return Platform.OS === 'ios' && config.federatedAuth.appleEnabled && config.federatedAuth.firebase !== null;
}

/** Full availability check, including the OS-level capability probe. */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (!isAppleAuthConfigured()) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred load, see file header
    const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Native Google Sign-In → Firebase credential exchange. Returns the Firebase
 * ID token to POST to the backend (NOT the raw Google ID token — the backend
 * verifies Firebase tokens, never provider tokens directly).
 */
export async function signInWithGoogleNative(): Promise<string> {
  let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred load, see file header
    ({ GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin'));
  } catch {
    throw new Error('Google sign-in is not available in this build.');
  }

  if (!googleConfigured) {
    GoogleSignin.configure({
      webClientId: config.federatedAuth.googleWebClientId,
      iosClientId: config.federatedAuth.googleIosClientId,
    });
    googleConfigured = true;
  }

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (response.type !== 'success' || !response.data.idToken) {
    throw new Error('Google sign-in was cancelled.');
  }

  const auth = getFirebaseAuth();
  const credential = GoogleAuthProvider.credential(response.data.idToken);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user.getIdToken();
}

/**
 * Sign in with Apple (iOS only) → Firebase credential exchange. Apple only
 * returns `fullName`/`email` on the FIRST authorization for a given app; no
 * code here (or anywhere in the federated flow) depends on the name being
 * present — identity is anchored on the verified Firebase uid/subject.
 */
export async function signInWithApple(): Promise<string> {
  let AppleAuthentication: typeof import('expo-apple-authentication');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred load, see file header
    AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
  } catch {
    throw new Error('Sign in with Apple is not available in this build.');
  }

  const rawNonce = hex(Crypto.getRandomBytes(16));
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const auth = getFirebaseAuth();
  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: credential.identityToken,
    rawNonce,
  });
  const userCredential = await signInWithCredential(auth, firebaseCredential);
  return userCredential.user.getIdToken();
}
