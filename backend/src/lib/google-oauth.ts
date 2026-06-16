import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { config } from '../config';

/**
 * Thin wrapper around google-auth-library for the Authorization Code + PKCE
 * flow. It builds the consent URL, exchanges the code, and STRICTLY verifies
 * the returned id_token (signature via Google's JWKS, audience, issuer, expiry).
 *
 * No secrets are logged. The client is created lazily and only when OAuth is
 * configured — importing this module never requires Google config.
 */

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

export interface GoogleProfile {
  sub: string; // stable Google account id
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** PKCE pair: a high-entropy verifier and its S256 challenge. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function getClient(): OAuth2Client {
  const { clientId, clientSecret, callbackUrl } = config.google;
  if (!clientId || !clientSecret || !callbackUrl) {
    // Defensive: env validation already enforces this when enabled.
    throw new Error('Google OAuth is not configured');
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri: callbackUrl });
}

/** Build the Google consent URL with state + PKCE challenge. */
export function buildAuthUrl(opts: { state: string; codeChallenge: string }): string {
  return getClient().generateAuthUrl({
    scope: GOOGLE_SCOPES,
    state: opts.state,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: opts.codeChallenge,
    access_type: 'online',
    prompt: 'select_account',
    include_granted_scopes: true,
  });
}

/**
 * Exchange an authorization code (+ PKCE verifier) for tokens and return the
 * verified Google profile. Throws if the id_token is missing or fails strict
 * verification.
 */
export async function exchangeCodeForProfile(opts: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleProfile> {
  const client = getClient();
  const { tokens } = await client.getToken({
    code: opts.code,
    codeVerifier: opts.codeVerifier,
  });
  if (!tokens.id_token) {
    throw new Error('Google did not return an id_token');
  }

  // verifyIdToken checks the signature (Google JWKS), audience == clientId,
  // issuer, and expiry. Anything off throws.
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.google.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Google id_token missing required claims');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name,
  };
}
