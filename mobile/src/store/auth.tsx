import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tokenStore } from './tokenStore';
import { userApi } from '@/api/userApi';
import type { PublicUser } from '@/types/api';

/**
 * Central auth/session context. Holds the current user, bootstraps from secure
 * storage on launch, and exposes login/register/logout/refresh. The mobile app
 * is user-only — there is no admin session concept here.
 */

interface AuthState {
  /** Still hydrating tokens / fetching the session on cold start. */
  bootstrapping: boolean;
  user: PublicUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (email: string, password: string, phone?: string) => Promise<{ emailVerificationRequired: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const res = await userApi.me();
      setUser(res.data.user);
    } catch {
      // Invalid/expired session — drop to logged-out state.
      await tokenStore.clear();
      setUser(null);
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await userApi.login({ email, password });
    await tokenStore.set(res.data.tokens);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (email: string, password: string, phone?: string) => {
    const res = await userApi.register({ email, password, ...(phone ? { phone } : {}) });
    return { emailVerificationRequired: res.data.emailVerificationRequired };
  }, []);

  const logout = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      bootstrapping,
      user,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
    }),
    [bootstrapping, user, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
