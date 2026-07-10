import { Alert } from 'react-native';
import { config } from '@/config';
import { tokenStore } from '@/store/tokenStore';
import type { Envelope } from '@/types/api';

/**
 * Typed fetch client around the EXORA response envelope:
 *   Success: { success: true, data, meta? }
 *   Error:   { success: false, error: { code, message, details? } }
 *
 * Non-2xx / { success: false } bodies throw {@link ApiError}. Authenticated
 * calls transparently refresh once on a 401. No secrets are stored or logged.
 */

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface FetchOpts {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
}

async function rawFetch<T>(path: string, opts: FetchOpts = {}): Promise<Envelope<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Network error — check your connection.', 'NETWORK_ERROR', 0);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty / non-JSON body */
  }

  const envelope = json as Partial<Envelope<T>> & {
    error?: { code?: string; message?: string; details?: unknown };
  };

  if (!res.ok || !envelope || envelope.success !== true) {
    throw new ApiError(
      envelope?.error?.message ?? `Request failed (${res.status})`,
      envelope?.error?.code ?? 'UNKNOWN',
      res.status,
      envelope?.error?.details,
    );
  }
  return envelope as Envelope<T>;
}

/** Unauthenticated request (auth, public market data). */
export function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<Envelope<T>> {
  return rawFetch<T>(path, opts);
}

/**
 * Global "session expired" hook. The auth store registers a handler so a failed
 * refresh drops the user to the login screen instead of leaving a half-broken
 * authenticated state (real-device QA fix).
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

/** Exchange the stored refresh token for a fresh pair. */
async function tryRefresh(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await rawFetch<{ tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/refresh',
      { method: 'POST', body: { refreshToken: refresh } },
    );
    await tokenStore.set(res.data.tokens);
    return true;
  } catch (err) {
    await tokenStore.clear();
    onUnauthorized?.();
    if (err instanceof ApiError && err.code === 'SESSION_REVOKED_BY_NEW_LOGIN') {
      Alert.alert(
        'Signed Out',
        'Your session was signed out because your account was opened on another device.'
      );
    }
    return false;
  }
}

/** Authenticated request with a single transparent refresh-and-retry on 401. */
export async function authedFetch<T>(path: string, opts: FetchOpts = {}): Promise<Envelope<T>> {
  try {
    return await rawFetch<T>(path, { ...opts, token: tokenStore.getAccess() });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      if (err.code === 'SESSION_REVOKED_BY_NEW_LOGIN') {
        await tokenStore.clear();
        onUnauthorized?.();
        Alert.alert(
          'Signed Out',
          'Your session was signed out because your account was opened on another device.'
        );
        throw err;
      }
      if (await tryRefresh()) {
        try {
          return await rawFetch<T>(path, { ...opts, token: tokenStore.getAccess() });
        } catch (retryErr) {
          if (retryErr instanceof ApiError && retryErr.code === 'SESSION_REVOKED_BY_NEW_LOGIN') {
            await tokenStore.clear();
            onUnauthorized?.();
            Alert.alert(
              'Signed Out',
              'Your session was signed out because your account was opened on another device.'
            );
          }
          throw retryErr;
        }
      }
    }
    throw err;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/** Friendly copy for the common withdrawal/KYC rejection codes. */
export function actionErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return errorMessage(err);
  const map: Record<string, string> = {
    KYC_REQUIRED: 'KYC approval is required for this action.',
    ACCOUNT_INACTIVE: 'Your account is frozen.',
    WITHDRAWALS_BLOCKED: 'Withdrawals are blocked on your account.',
    WITHDRAWALS_FROZEN: 'Withdrawals are blocked on your account.',
    INSUFFICIENT_BALANCE: 'Insufficient balance.',
    ADDRESS_NOT_ALLOWLISTED: 'This withdrawal address is not allowlisted.',
    ADDRESS_COOLING_OFF: 'This address is in a cooling-off period.',
    MINIMUM_AMOUNT_NOT_MET: 'Below the minimum amount.',
    AMOUNT_TOO_SMALL: 'Below the minimum amount.',
    CONSENT_REQUIRED: 'Please accept the current Terms, Privacy Policy and Risk Disclosure in Legal & Policies to continue.',
    RATE_LIMITED: 'Too many attempts. Please wait a moment before trying again.',
    DB_REQUEST_ERROR: 'EXORA is temporarily unavailable. Please try again shortly.',
    DB_VALIDATION_ERROR: 'EXORA is temporarily unavailable. Please try again shortly.',
    INTERNAL_ERROR: 'EXORA is temporarily unavailable. Please try again shortly.',
    SERVICE_UNAVAILABLE: 'EXORA is temporarily unavailable. Please try again shortly.',
  };
  return map[err.code] ?? err.message;
}
