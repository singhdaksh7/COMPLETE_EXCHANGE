import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../config';
import { logger } from './logger';
import { ServiceUnavailableError, UnauthorizedError } from './errors';

/**
 * Federated identity verification layer (Stage 12).
 *
 * Firebase Authentication is ONLY a verification layer for Google/Apple
 * sign-in — EXORA remains authoritative for users, sessions, and tokens (see
 * auth.federated.service.ts). This module's ONLY job is: given a client-
 * supplied Firebase ID token, cryptographically verify it and derive the
 * REAL identity (uid, provider, email, email_verified) from the verified
 * claims — never from anything the client asserts directly.
 */

export type FederatedProvider = 'GOOGLE' | 'APPLE';

export interface VerifiedFederatedIdentity {
  /** Firebase project-scoped uid. */
  uid: string;
  /** The underlying provider's stable subject (Google/Apple `sub`). */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  provider: FederatedProvider;
}

export interface FederatedIdentityVerifier {
  /** Whether the verifier has real Firebase Admin credentials configured. */
  readonly configured: boolean;
  /**
   * Verify a Firebase ID token and return the derived identity. Throws on any
   * invalid/expired/malformed token, or when the token's actual sign-in
   * provider isn't a supported one — NEVER returns a value for an unverified
   * token.
   */
  verifyIdToken(idToken: string): Promise<VerifiedFederatedIdentity>;
}

function mapSignInProvider(signInProvider: string | undefined): FederatedProvider | undefined {
  if (signInProvider === 'google.com') return 'GOOGLE';
  if (signInProvider === 'apple.com') return 'APPLE';
  return undefined;
}

let firebaseApp: App | undefined | null = null; // null = "checked, not configured"
function getFirebaseApp(): App | undefined {
  if (firebaseApp !== null) return firebaseApp ?? undefined;
  const { projectId, clientEmail, privateKey } = config.firebase;
  if (!projectId || !clientEmail || !privateKey) {
    firebaseApp = null;
    return undefined;
  }
  try {
    firebaseApp = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } catch (err) {
    // Never crash boot over this — config.ts intentionally does not fail fast
    // for Firebase (see env.ts Stage 12 comment). Log without secrets.
    logger.error({ err: (err as Error).message }, 'Firebase Admin initialization failed');
    firebaseApp = null;
    return undefined;
  }
  return firebaseApp;
}

export const firebaseIdentityVerifier: FederatedIdentityVerifier = {
  get configured(): boolean {
    return getFirebaseApp() !== undefined;
  },

  async verifyIdToken(idToken: string): Promise<VerifiedFederatedIdentity> {
    const app = getFirebaseApp();
    if (!app) {
      throw new ServiceUnavailableError('Federated sign-in is temporarily unavailable');
    }

    // getAuth().verifyIdToken checks signature (Google's public JWKS), issuer,
    // audience (== FIREBASE_PROJECT_ID), expiry, and not-before. Never logs the
    // raw token — only the derived, non-secret claims below.
    const decoded = await getAuth(app).verifyIdToken(idToken);

    const provider = mapSignInProvider(decoded.firebase?.sign_in_provider);
    if (!provider) {
      throw new UnauthorizedError(
        'Unsupported federated identity provider',
        'FEDERATED_PROVIDER_UNSUPPORTED',
      );
    }

    // Prefer the underlying provider's own subject from the Firebase
    // `identities` claim (e.g. the real Google `sub`); fall back to the
    // Firebase uid if it is ever absent for a supported provider.
    const identities = decoded.firebase?.identities as
      | Record<string, string[] | undefined>
      | undefined;
    const providerKey = provider === 'GOOGLE' ? 'google.com' : 'apple.com';
    const subject = identities?.[providerKey]?.[0] ?? decoded.uid;

    return {
      uid: decoded.uid,
      subject,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      provider,
    };
  },
};
