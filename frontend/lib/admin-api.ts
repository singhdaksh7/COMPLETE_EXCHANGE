import { ApiError, type Envelope } from './api';
import { tokenStore } from './auth';
import type {
  AdminKycQueue,
  AdminListItem,
  AdminLoginData,
  AdminMeData,
  AdminRoleOption,
  Conversion,
  CreatedAdmin,
  CryptoWithdrawal,
  InrDeposit,
  KycProfile,
  Page,
  PublicAdmin,
  ScannerHealth,
} from './types';

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/**
 * Absolute admin API base, read DIRECTLY from the public env var.
 *
 * Next.js inlines NEXT_PUBLIC_* at build time. We fall back to the local dev URL
 * ONLY when the env var is missing — and the fallback is ABSOLUTE
 * (http://localhost:4001/...), never a relative "/admin/v1". A relative base was
 * the bug: the browser resolved it against the Next dev origin (:3000) and hit
 * the dev server instead of the admin API on :4001.
 */
const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:4001/admin/v1';

/**
 * Admin request helper. `method` is a REQUIRED argument — there is deliberately
 * no GET default, so an admin mutation (login, decision) can never silently
 * degrade into a GET. It calls `fetch(`${ADMIN_API_BASE}${path}`, { method })`.
 */
async function adminApiFetch<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  opts: { body?: unknown; auth?: boolean } = {},
): Promise<Envelope<T>> {
  const { body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = tokenStore.getAdminAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const url = `${ADMIN_API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Network error — is the admin API running on :4001 and CORS allowed?',
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
    if (res.status === 401) tokenStore.clearAdmin();
    throw new ApiError(
      envelope?.error?.message ?? `Request failed (${res.status})`,
      envelope?.error?.code ?? 'UNKNOWN',
      res.status,
      envelope?.error?.details,
    );
  }

  return envelope as Envelope<T>;
}

export const adminApi = {
  // Admin login: explicit POST to the ABSOLUTE base, unauthenticated.
  login: (body: { email: string; password: string; totp: string }) =>
    adminApiFetch<AdminLoginData>('/auth/login', 'POST', { body, auth: false }),

  me: () => adminApiFetch<AdminMeData>('/auth/me', 'GET'),

  kycQueue: (params: { cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set('cursor', params.cursor);
    qs.set('limit', String(params.limit ?? 20));
    return adminApiFetch<AdminKycQueue>(`/kyc?${qs.toString()}`, 'GET');
  },

  decide: (
    userId: string,
    body: { decision: 'APPROVE' | 'REJECT'; tier?: number; reason?: string },
  ) => adminApiFetch<KycProfile>(`/kyc/${userId}/decision`, 'POST', { body }),

  // ---- INR deposit monitoring + manual approval ----
  deposits: (params: { status?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<Page<InrDeposit>>(
      `/inr/deposits${buildQuery({ limit: 20, ...params })}`,
      'GET',
    ),

  approveDeposit: (id: string) =>
    adminApiFetch<InrDeposit>(`/inr/deposits/${id}/approve`, 'POST'),

  rejectDeposit: (id: string, reason: string) =>
    adminApiFetch<InrDeposit>(`/inr/deposits/${id}/reject`, 'POST', {
      body: { reason },
    }),

  // ---- withdrawal queue + decisions ----
  withdrawals: (params: { status?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<Page<CryptoWithdrawal>>(
      `/withdrawals${buildQuery({ limit: 20, ...params })}`,
      'GET',
    ),

  approveWithdrawal: (id: string) =>
    adminApiFetch<CryptoWithdrawal>(`/withdrawals/${id}/approve`, 'POST'),

  rejectWithdrawal: (id: string, reason: string) =>
    adminApiFetch<CryptoWithdrawal>(`/withdrawals/${id}/reject`, 'POST', {
      body: { reason },
    }),

  // ---- conversion monitoring ----
  conversions: (params: { side?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<Page<Conversion>>(
      `/conversions${buildQuery({ limit: 20, ...params })}`,
      'GET',
    ),

  // ---- scanner health ----
  scannerHealth: () => adminApiFetch<ScannerHealth>('/scanner/health', 'GET'),

  // ---- admin management (Stage 3.4B) ----
  listAdmins: () =>
    adminApiFetch<{ items: AdminListItem[] }>('/admins', 'GET'),

  listRoles: () =>
    adminApiFetch<{ items: AdminRoleOption[] }>('/roles', 'GET'),

  createAdmin: (body: { email: string; roleId: string; status?: string }) =>
    adminApiFetch<CreatedAdmin>('/admins', 'POST', { body }),

  assignRole: (adminId: string, roleId: string) =>
    adminApiFetch<{ assigned: boolean }>(
      `/admins/${adminId}/roles/${roleId}`,
      'POST',
    ),

  removeRole: (adminId: string, roleId: string) =>
    adminApiFetch<{ removed: boolean }>(
      `/admins/${adminId}/roles/${roleId}`,
      'DELETE',
    ),

  setAdminStatus: (adminId: string, status: 'ACTIVE' | 'SUSPENDED') =>
    adminApiFetch<{ admin: PublicAdmin }>(`/admins/${adminId}/status`, 'PATCH', {
      body: { status },
    }),

  resetAdminTotp: (adminId: string) =>
    adminApiFetch<{ admin: PublicAdmin }>(`/admins/${adminId}/totp/reset`, 'POST'),

  setIpAllowlist: (adminId: string, ips: string[]) =>
    adminApiFetch<{ id: string; ipAllowlist: string[]; ipRestricted: boolean }>(
      `/admins/${adminId}/ip-allowlist`,
      'PUT',
      { body: { ips } },
    ),
};
