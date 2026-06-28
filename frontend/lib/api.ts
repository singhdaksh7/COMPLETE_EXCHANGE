/**
 * Tiny fetch wrapper around the backend's response envelope.
 *
 * Success: { success: true, data, meta? }
 * Error:   { success: false, error: { code, message, details? } }
 *
 * Non-2xx responses and `success: false` bodies are thrown as {@link ApiError}.
 */
export interface Envelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

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

export async function apiFetch<T>(
  baseUrl: string,
  path: string,
  opts: FetchOpts = {},
): Promise<Envelope<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Network error — is the backend running and CORS allowed?',
      'NETWORK_ERROR',
      0,
    );
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

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/**
 * Extract field-level messages from a backend VALIDATION_ERROR. The backend
 * sends `details: [{ path, message }]`; we surface them keyed by field path so
 * forms can show "UPI ID is required" next to the input instead of a generic
 * "Request validation failed".
 */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const d of err.details as Array<{ path?: string; message?: string }>) {
    if (d && typeof d.path === 'string' && typeof d.message === 'string' && !out[d.path]) {
      out[d.path] = d.message;
    }
  }
  return out;
}

export function withdrawalErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return errorMessage(err);
  const messages: Record<string, string> = {
    KYC_REQUIRED: 'KYC required',
    ACCOUNT_INACTIVE: 'Account frozen',
    WITHDRAWALS_BLOCKED: 'Withdrawals blocked',
    INSUFFICIENT_BALANCE: 'Insufficient balance',
    ADDRESS_NOT_ALLOWLISTED: 'Invalid address',
    ADDRESS_COOLING_OFF: 'Invalid address',
    VALIDATION_ERROR: 'Invalid address',
    MINIMUM_AMOUNT_NOT_MET: 'Minimum amount not met',
    AMOUNT_TOO_SMALL: 'Minimum amount not met',
    WITHDRAWALS_FROZEN: 'Withdrawals blocked',
  };
  return messages[err.code] ?? err.message;
}

/** True when a request was rejected because the user's KYC is not approved. */
export function isKycRequired(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'KYC_REQUIRED';
}
