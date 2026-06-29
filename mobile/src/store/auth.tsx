import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tokenStore } from './tokenStore';
import { setUnauthorizedHandler } from '@/api/client';
import { userApi } from '@/api/userApi';
import { isTwoFactorChallenge, type PublicUser, type UserFeatureMap } from '@/types/api';

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
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  /** Finish a 2FA-gated login with the challenge token + TOTP/backup code. */
  complete2fa: (challengeToken: string, code: string) => Promise<PublicUser>;
  register: (email: string, password: string, phone?: string) => Promise<{ emailVerificationRequired: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [features, setFeatures] = useState<UserFeatureMap | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const res = await userApi.me();
      setUser(res.data.user);
      setFeatures(res.data.features ?? null);
    } catch {
      // Invalid/expired session — drop to logged-out state.
      await tokenStore.clear();
      setUser(null);
      setFeatures(null);
    }
  }, []);

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
    async (email: string, password: string): Promise<LoginOutcome> => {
      const res = await userApi.login({ email, password });
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
    async (challengeToken: string, code: string) => {
      const res = await userApi.verify2fa(challengeToken, code);
      await tokenStore.set(res.data.tokens);
      setUser(res.data.user);
      await refreshUser();
      return res.data.user;
    },
    [refreshUser],
  );

  const register = useCallback(async (email: string, password: string, phone?: string) => {
    const res = await userApi.register({ email, password, ...(phone ? { phone } : {}) });
    return { emailVerificationRequired: res.data.emailVerificationRequired };
  }, []);

  const logout = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
    setFeatures(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      bootstrapping,
      user,
      features,
      isAuthenticated: !!user,
      login,
      complete2fa,
      register,
      logout,
      refreshUser,
    }),
    [bootstrapping, user, features, login, complete2fa, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
