import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockVerifyIdToken, mockInitializeApp, mockGetApps, mockCert } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockInitializeApp: vi.fn(() => ({ name: 'app' })),
  mockGetApps: vi.fn(() => []),
  mockCert: vi.fn((c: unknown) => c),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: mockInitializeApp,
  getApps: mockGetApps,
  cert: mockCert,
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

/**
 * `vi.resetModules()` gives the verifier a FRESH `../../config` module
 * instance each time, so the mutation must happen on THAT fresh instance
 * (imported after the reset) — mutating a config reference captured before
 * the reset silently no-ops against the old, discarded module instance.
 */
async function loadVerifierWith(
  cfg: { projectId?: string; clientEmail?: string; privateKey?: string } | null,
) {
  vi.resetModules();
  const { config } = await import('../../src/config');
  (config.firebase as { projectId?: string; clientEmail?: string; privateKey?: string }).projectId = cfg?.projectId;
  (config.firebase as { projectId?: string; clientEmail?: string; privateKey?: string }).clientEmail = cfg?.clientEmail;
  (config.firebase as { projectId?: string; clientEmail?: string; privateKey?: string }).privateKey = cfg?.privateKey;
  return import('../../src/lib/federated-identity-verifier');
}

const FULL_CONFIG = {
  projectId: 'proj-1',
  clientEmail: 'sa@proj-1.iam.gserviceaccount.com',
  privateKey: '-----BEGIN KEY-----\nabc\n-----END KEY-----\n',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApps.mockReturnValue([]);
});

describe('firebaseIdentityVerifier — claim derivation (Stage 12A Goal 5)', () => {
  it('is not configured when any of projectId/clientEmail/privateKey is missing', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith({
      projectId: 'proj-1',
      clientEmail: undefined,
      privateKey: 'x',
    });
    expect(firebaseIdentityVerifier.configured).toBe(false);
  });

  it('verifyIdToken throws a safe "unavailable" error (never a bypass) when unconfigured', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(null);
    await expect(firebaseIdentityVerifier.verifyIdToken('any-token')).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
    });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('derives GOOGLE provider + the underlying Google sub (not the Firebase uid) from identities', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(FULL_CONFIG);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-xyz',
      email: 'user@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['google-sub-real'] } },
    });

    const result = await firebaseIdentityVerifier.verifyIdToken('tok');

    expect(result).toEqual({
      uid: 'firebase-uid-xyz',
      subject: 'google-sub-real',
      email: 'user@example.com',
      emailVerified: true,
      provider: 'GOOGLE',
    });
  });

  it('derives APPLE provider + the apple.com identity subject', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(FULL_CONFIG);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-abc',
      email: 'user@icloud.com',
      email_verified: true,
      firebase: { sign_in_provider: 'apple.com', identities: { 'apple.com': ['apple-sub-real'] } },
    });

    const result = await firebaseIdentityVerifier.verifyIdToken('tok');
    expect(result.provider).toBe('APPLE');
    expect(result.subject).toBe('apple-sub-real');
  });

  it('falls back to the Firebase uid as subject when the identities claim is absent', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(FULL_CONFIG);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-only',
      email: 'user@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });

    const result = await firebaseIdentityVerifier.verifyIdToken('tok');
    expect(result.subject).toBe('firebase-uid-only');
  });

  it('rejects a password sign-in-provider token (not a supported federated provider)', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(FULL_CONFIG);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-pw',
      email: 'user@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    });

    await expect(firebaseIdentityVerifier.verifyIdToken('tok')).rejects.toMatchObject({
      errorCode: 'FEDERATED_PROVIDER_UNSUPPORTED',
    });
  });

  it('rejects an anonymous sign-in-provider token', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(FULL_CONFIG);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-anon',
      email: null,
      email_verified: false,
      firebase: { sign_in_provider: 'anonymous' },
    });

    await expect(firebaseIdentityVerifier.verifyIdToken('tok')).rejects.toMatchObject({
      errorCode: 'FEDERATED_PROVIDER_UNSUPPORTED',
    });
  });

  it('rejects a custom-provider token', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(FULL_CONFIG);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-custom',
      email: 'user@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'custom' },
    });

    await expect(firebaseIdentityVerifier.verifyIdToken('tok')).rejects.toMatchObject({
      errorCode: 'FEDERATED_PROVIDER_UNSUPPORTED',
    });
  });

  it('passes through a missing email as null (the SERVICE layer decides the product rule, not the verifier)', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(FULL_CONFIG);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-noemail',
      email: undefined,
      email_verified: false,
      firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['sub'] } },
    });

    const result = await firebaseIdentityVerifier.verifyIdToken('tok');
    expect(result.email).toBeNull();
    expect(result.emailVerified).toBe(false);
  });

  it('never logs the raw idToken it was given', async () => {
    const { firebaseIdentityVerifier } = await loadVerifierWith(FULL_CONFIG);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'u',
      email: 'e@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['s'] } },
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const SECRET_TOKEN = 'super-secret-raw-id-token-value';
    await firebaseIdentityVerifier.verifyIdToken(SECRET_TOKEN);

    for (const call of logSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SECRET_TOKEN);
    }
    logSpy.mockRestore();
  });
});
