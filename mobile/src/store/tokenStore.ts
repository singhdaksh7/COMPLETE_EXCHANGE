import * as SecureStore from 'expo-secure-store';
import type { TokenPair } from '@/types/api';

/**
 * Secure token storage backed by expo-secure-store (Android Keystore / iOS
 * Keychain). Tokens are the ONLY thing persisted; no PII or secrets. An
 * in-memory cache keeps synchronous reads fast for the API client between async
 * loads. Works the same on iOS for the later EAS build.
 */

const ACCESS_KEY = 'exora.user.access';
const REFRESH_KEY = 'exora.user.refresh';

let memAccess: string | null = null;
let memRefresh: string | null = null;

export const tokenStore = {
  /** Hydrate the in-memory cache from secure storage at app start. */
  async load(): Promise<TokenPair | null> {
    try {
      const [access, refresh] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_KEY),
        SecureStore.getItemAsync(REFRESH_KEY),
      ]);
      memAccess = access;
      memRefresh = refresh;
      if (access && refresh) return { accessToken: access, refreshToken: refresh };
      return null;
    } catch {
      return null;
    }
  },

  getAccess(): string | null {
    return memAccess;
  },

  getRefresh(): string | null {
    return memRefresh;
  },

  async set(tokens: TokenPair): Promise<void> {
    memAccess = tokens.accessToken;
    memRefresh = tokens.refreshToken;
    try {
      await Promise.all([
        SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
        SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
      ]);
    } catch {
      /* best-effort; in-memory copy still works for the session */
    }
  },

  async clear(): Promise<void> {
    memAccess = null;
    memRefresh = null;
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_KEY),
        SecureStore.deleteItemAsync(REFRESH_KEY),
      ]);
    } catch {
      /* ignore */
    }
  },
};
