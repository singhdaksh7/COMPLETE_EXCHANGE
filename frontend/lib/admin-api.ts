import { ApiError, type Envelope } from './api';
import { tokenStore } from './auth';
import type {
  AdminKycDetail,
  AdminKycQueue,
  AdminNotification,
  AdminUserDetail,
  AdminUserListItem,
  AdminListItem,
  AdminLoginData,
  AdminMeData,
  AdminRoleOption,
  ComplianceSummary,
  Conversion,
  CreatedAdmin,
  CryptoWithdrawal,
  FeeReport,
  InrDeposit,
  KycDecisionBody,
  KycProfile,
  KycQueueFilters,
  OperationsAuditLog,
  OperationsSummary,
  Page,
  PublicAdmin,
  ScannerHealth,
  SystemOverview,
  SystemHealth,
  SystemQueues,
  SystemScanner,
  SystemMail,
  SystemRiskAlerts,
  ComplianceQueueItem,
  AdminComplianceDetail,
  AdminScreeningView,
  ScreeningDecision,
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

/**
 * Authenticated CSV download: fetches with the admin bearer token, then triggers
 * a browser download. Returns nothing; throws ApiError on failure.
 */
async function adminDownload(path: string, filename: string): Promise<void> {
  const token = tokenStore.getAdminAccess();
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => {
    throw new ApiError('Network error downloading export', 'NETWORK_ERROR', 0);
  });
  if (!res.ok) {
    if (res.status === 401) tokenStore.clearAdmin();
    throw new ApiError(`Export failed (${res.status})`, 'EXPORT_FAILED', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const adminApi = {
  // Admin login: explicit POST to the ABSOLUTE base, unauthenticated.
  login: (body: { email: string; password: string; totp: string }) =>
    adminApiFetch<AdminLoginData>('/auth/login', 'POST', { body, auth: false }),

  me: () => adminApiFetch<AdminMeData>('/auth/me', 'GET'),

  kycQueue: (params: KycQueueFilters = {}) =>
    adminApiFetch<AdminKycQueue>(
      `/kyc${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  kycDetail: (userId: string) =>
    adminApiFetch<AdminKycDetail>(`/kyc/${userId}`, 'GET'),

  decide: (userId: string, body: KycDecisionBody) =>
    adminApiFetch<KycProfile>(`/kyc/${userId}/decision`, 'POST', { body }),

  addKycNote: (userId: string, note: string) =>
    adminApiFetch<AdminKycDetail>(`/kyc/${userId}/note`, 'POST', { body: { note } }),

  complianceSummary: () =>
    adminApiFetch<ComplianceSummary>('/kyc/compliance/summary', 'GET'),

  // ---- notification delivery log (Stage 4.0) ----
  notifications: (params: { type?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: AdminNotification[]; nextCursor: string | null }>(
      `/notifications${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  // ---- user management + risk controls ----
  users: (
    params: {
      email?: string;
      kycStatus?: string;
      accountStatus?: string;
      riskLevel?: string;
      createdFrom?: string;
      createdTo?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) =>
    adminApiFetch<Page<AdminUserListItem>>(
      `/users${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  userDetail: (userId: string) =>
    adminApiFetch<AdminUserDetail>(`/users/${userId}`, 'GET'),

  setUserStatus: (userId: string, status: 'ACTIVE' | 'FROZEN') =>
    adminApiFetch<AdminUserListItem>(`/users/${userId}/status`, 'PATCH', {
      body: { status },
    }),

  setUserWithdrawalBlock: (userId: string, withdrawalsBlocked: boolean) =>
    adminApiFetch<AdminUserListItem>(
      `/users/${userId}/withdrawals-block`,
      'PATCH',
      { body: { withdrawalsBlocked } },
    ),

  updateUserRisk: (
    userId: string,
    body: { riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'; riskNote?: string | null },
  ) => adminApiFetch<AdminUserListItem>(`/users/${userId}/risk`, 'PATCH', { body }),

  // ---- INR deposit monitoring + manual approval ----
  deposits: (
    params: {
      status?: string;
      cursor?: string;
      limit?: number;
      userId?: string;
      email?: string;
      utr?: string;
      minAmount?: string;
      maxAmount?: string;
      fromDate?: string;
      toDate?: string;
    } = {},
  ) =>
    adminApiFetch<Page<InrDeposit>>(
      `/inr/deposits${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  approveDeposit: (id: string) =>
    adminApiFetch<InrDeposit>(`/inr/deposits/${id}/approve`, 'POST'),

  rejectDeposit: (id: string, reason: string) =>
    adminApiFetch<InrDeposit>(`/inr/deposits/${id}/reject`, 'POST', {
      body: { reason },
    }),

  // ---- withdrawal queue + decisions ----
  withdrawals: (
    params: {
      status?: string;
      asset?: string;
      userId?: string;
      email?: string;
      fromDate?: string;
      toDate?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) =>
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

  // ---- fee revenue reports (Stage 3.8) ----
  feeReport: (params: { fromDate?: string; toDate?: string } = {}) =>
    adminApiFetch<FeeReport>(`/reports/fees${buildQuery(params)}`, 'GET'),

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

  // ---- operations dashboard + audit (Stage 3.4C) ----
  operationsSummary: () =>
    adminApiFetch<OperationsSummary>('/operations/summary', 'GET'),

  audit: (params: Record<string, string | number | undefined> = {}) =>
    adminApiFetch<Page<OperationsAuditLog>>(
      `/operations/audit${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  exportDepositsCsv: (params: Record<string, string | number | undefined> = {}) =>
    adminDownload(`/inr/deposits/export${buildQuery(params)}`, 'inr-deposits.csv'),

  exportAuditCsv: (params: Record<string, string | number | undefined> = {}) =>
    adminDownload(`/operations/audit/export${buildQuery(params)}`, 'admin-audit.csv'),

  // ---- system / ops command center (Stage 4.3) ----
  systemOverview: () => adminApiFetch<SystemOverview>('/system/overview', 'GET'),
  systemHealth: () => adminApiFetch<SystemHealth>('/system/health', 'GET'),
  systemQueues: () => adminApiFetch<SystemQueues>('/system/queues', 'GET'),
  systemScanner: () => adminApiFetch<SystemScanner>('/system/scanner', 'GET'),
  systemMail: () => adminApiFetch<SystemMail>('/system/mail', 'GET'),
  systemRiskAlerts: () => adminApiFetch<SystemRiskAlerts>('/system/risk-alerts', 'GET'),

  // ---- compliance / FIU review (Stage 5.0) ----
  complianceUsers: (
    params: { status?: string; riskLevel?: string; email?: string; cursor?: string; limit?: number } = {},
  ) =>
    adminApiFetch<{ items: ComplianceQueueItem[]; nextCursor: string | null }>(
      `/compliance/users${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  complianceDetail: (userId: string) =>
    adminApiFetch<AdminComplianceDetail>(`/compliance/users/${userId}`, 'GET'),

  complianceReview: (
    userId: string,
    body: { decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO'; reason?: string; complianceNote?: string; nextReviewInDays?: number },
  ) => adminApiFetch<AdminComplianceDetail>(`/compliance/users/${userId}/review`, 'POST', { body }),

  complianceSetRisk: (
    userId: string,
    body: { level: 'LOW' | 'MEDIUM' | 'HIGH' | 'PROHIBITED'; reason?: string; score?: number },
  ) => adminApiFetch<AdminComplianceDetail>(`/compliance/users/${userId}/risk`, 'POST', { body }),

  complianceExport: (userId: string) =>
    adminDownload(`/compliance/users/${userId}/export`, `compliance-${userId}.json`),

  // ---- screening: sanctions / PEP / adverse-media (Stage 5.1) ----
  complianceScreening: (userId: string) =>
    adminApiFetch<AdminScreeningView>(`/compliance/users/${userId}/screening`, 'GET'),

  complianceRunScreening: (userId: string) =>
    adminApiFetch<AdminScreeningView>(`/compliance/users/${userId}/screening/run`, 'POST'),

  complianceScreeningDecision: (
    userId: string,
    checkId: string,
    body: { decision: ScreeningDecision; note?: string },
  ) =>
    adminApiFetch<AdminScreeningView>(
      `/compliance/users/${userId}/screening/${checkId}/decision`,
      'POST',
      { body },
    ),
};
