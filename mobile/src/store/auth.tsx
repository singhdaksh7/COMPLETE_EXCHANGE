import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tokenStore } from './tokenStore';
import { setUnauthorizedHandler } from '@/api/client';
import { userApi } from '@/api/userApi';
import { isTwoFactorChallenge, type AcceptedPolicies, type ConsentStatus, type LoginData, type PublicUser, type UserFeatureMap } from '@/types/api';

/**
 * Result of a password login. Either the session is established, or the account
 * has 2FA enabled and a second factor is required to finish (the caller then
 * collects a code and calls complete2fa with the challenge token).
 */
export type LoginOutcome =
  | { status: 'authenticated'; user: PublicUser }
  | { status: '2fa_required'; challengeToken: string };

/**
 * Central auth/session context. Holds the current user, bootstraps from secure
 * storage on launch, and exposes login/register/logout/refresh. The mobile app
 * is user-only — there is no admin session concept here.
 */

interface AuthState {
  /** Still hydrating tokens / fetching the session on cold start. */
  bootstrapping: boolean;
  user: PublicUser | null;
  /**
   * Effective feature map from /auth/me. Screens gate on this so crypto funding
   * stays hidden and INR withdraw/trade follow the backend's per-user + global
   * flags. Null until /auth/me has resolved (treat null as "unknown", not "on").
   */
  features: UserFeatureMap | null;
  /** Outstanding required-policy status from /legal/consent-status. Null until resolved OR when the last fetch failed — see `consentCheckFailed` to tell those apart. */
  consentStatus: ConsentStatus | null;
  /**
   * True when the most recent /legal/consent-status fetch failed (network,
   * timeout, 5xx). Distinct from `consentStatus === null` on first mount —
   * the root navigator uses this to show a "Policy Status Unavailable" limited
   * mode instead of either the normal app or the accept-policies gate, since a
   * failed check must never be treated as "consent confirmed".
   */
  consentCheckFailed: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, location?: { latitude: number; longitude: number; accuracy: number } | null) => Promise<LoginOutcome>;
  /** Finish a 2FA-gated login with the challenge token + TOTP/backup code. */
  complete2fa: (challengeToken: string, code: string, location?: { latitude: number; longitude: number; accuracy: number } | null) => Promise<PublicUser>;
  /**
   * Store an ALREADY-issued session (Stage 12 federated login/link/register —
   * every one of those backend calls returns the exact same `{ user, tokens }`
   * shape a password login does once resolved past any 2FA/link/registration
   * challenge). Mirrors the tail of `login()`.
   */
  loginWithFederatedResult: (result: LoginData) => Promise<PublicUser>;
  register: (
    email: string,
    password: string,
    acceptedPolicies: AcceptedPolicies,
    phone?: string,
  ) => Promise<{ emailVerificationRequired: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshConsentStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [features, setFeatures] = useState<UserFeatureMap | null>(null);
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(null);
  const [consentCheckFailed, setConsentCheckFailed] = useState(false);

  const refreshConsentStatus = useCallback(async () => {
    try {
      const res = await userApi.consentStatus();
      setConsentStatus(res.data);
      setConsentCheckFailed(false);
    } catch {
      // Network/timeout/5xx — do NOT assume consent is accepted. The root
      // navigator shows a distinct "Policy Status Unavailable" limited mode
      // rather than silently unlocking the normal app (previously this failed
      // open; Stage 10B replaces that with an explicit safe state).
      setConsentStatus(null);
      setConsentCheckFailed(true);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await userApi.me();
      setUser(res.data.user);
      setFeatures(res.data.features ?? null);
      await refreshConsentStatus();
    } catch {
      // Invalid/expired session — drop to logged-out state.
      await tokenStore.clear();
      setUser(null);
      setFeatures(null);
      setConsentStatus(null);
      setConsentCheckFailed(false);
    }
  }, [refreshConsentStatus]);

  // Cold-start bootstrap: load tokens, then validate the session.
  useEffect(() => {
    let active = true;
    (async () => {
      const tokens = await tokenStore.load();
      if (active && tokens) await refreshUser();
      if (active) setBootstrapping(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshUser]);

  // A failed token refresh anywhere in the app drops us to logged-out state; the
  // root navigator then redirects to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string, location?: { latitude: number; longitude: number; accuracy: number } | null): Promise<LoginOutcome> => {
      const res = await userApi.login({ email, password, location });
      // 2FA-enabled accounts get no session here — only a short-lived challenge
      // token. No tokens are stored until the second factor is verified.
      if (isTwoFactorChallenge(res.data)) {
        return { status: '2fa_required', challengeToken: res.data.challengeToken };
      }
      await tokenStore.set(res.data.tokens);
      setUser(res.data.user);
      // The login response has no feature map; pull it from /auth/me so the
      // session knows what's enabled (crypto stays hidden in INR-only mode).
      await refreshUser();
      return { status: 'authenticated', user: res.data.user };
    },
    [refreshUser],
  );

  const complete2fa = useCallback(
    async (challengeToken: string, code: string, location?: { latitude: number; longitude: number; accuracy: number } | null) => {
      const res = await userApi.verify2fa(challengeToken, code, location);
      await tokenStore.set(res.data.tokens);
      setUser(res.data.user);
      await refreshUser();
      return res.data.user;
    },
    [refreshUser],
  );

  const loginWithFederatedResult = useCallback(
    async (result: LoginData) => {
      await tokenStore.set(result.tokens);
      setUser(result.user);
      await refreshUser();
      return result.user;
    },
    [refreshUser],
  );

  const register = useCallback(
    async (email: string, password: string, acceptedPolicies: AcceptedPolicies, phone?: string) => {
      const res = await userApi.register({
        email,
        password,
        acceptedPolicies,
        ...(phone ? { phone } : {}),
      });
      return { emailVerificationRequired: res.data.emailVerificationRequired };
    },
    [],
  );

  const logout = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
    setFeatures(null);
    setConsentStatus(null);
    setConsentCheckFailed(false);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      bootstrapping,
      user,
      features,
      consentStatus,
      consentCheckFailed,
      isAuthenticated: !!user,
      login,
      complete2fa,
      loginWithFederatedResult,
      register,
      logout,
      refreshUser,
      refreshConsentStatus,
    }),
    [
      bootstrapping,
      user,
      features,
      consentStatus,
      consentCheckFailed,
      login,
      complete2fa,
      loginWithFederatedResult,
      register,
      logout,
      refreshUser,
      refreshConsentStatus,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
