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
