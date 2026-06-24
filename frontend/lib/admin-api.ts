import { ApiError, type Envelope } from './api';
import { tokenStore } from './auth';
import type {
  AdminKycDetail,
  AdminKycQueue,
  AdminNotification,
  AdminUserDetail,
  AdminUserListItem,
  UserProfile,
  ProfileSection,
  ProfilePage,
  ProfileComplianceNote,
  AdminListItem,
  UserFeatureControls,
  UserControlFlag,
  UserControlAuditEntry,
  AdminLoginData,
  AdminMeData,
  AdminRoleOption,
  ComplianceSummary,
  ComplianceDashboard,
  ComplianceDashboardFilters,
  CommandCenter,
  AdminNotificationPage,
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
  ComplianceCaseListItem,
  ComplianceCaseDetail,
  ComplianceCaseSummary,
  ComplianceAlertItem,
  ComplianceCaseStatus,
  ComplianceAlertStatus,
  ComplianceCasePriority,
  ComplianceCaseType,
  MonitoringRunResult,
  WalletRiskCheckItem,
  WalletRiskProfileItem,
  WalletRiskProfileDetail,
  WalletRiskSummary,
  WalletRiskLevel,
  WalletRiskStatus,
  TravelRuleTransferItem,
  TravelRuleStatus,
  TravelRuleDirection,
  TravelRuleAction,
  EvidencePackListItem,
  EvidencePackDetail,
  EvidencePackType,
  EvidencePackStatus,
  RetentionPolicy,
  RetentionReview,
  RetentionReviewStatus,
  ComplianceExportEventItem,
  TaxRule,
  TaxRuleStatus,
  TaxEventType,
  TdsRecordItem,
  TaxStatementItem,
  LegalDocument,
  LegalDocumentType,
  LegalAcceptanceItem,
  FiuReportListItem,
  FiuReportDetail,
  FiuReportType,
  FiuDraftStatus,
  FiuReportScopeType,
  FiuExportEventItem,
  AmlPolicyListItem,
  AmlPolicyDetail,
  AmlRule,
  AmlRuleType,
  AmlRuleSeverity,
  AmlRuleAction,
  AmlEvaluationResult,
  WorkspaceSummary,
  ComplianceTaskListItem,
  ComplianceTaskDetail,
  ComplianceTaskType,
  ComplianceTaskStatus,
  ComplianceTaskPriority,
  ComplianceTaskEventItem,
  AmlChecklistTemplate,
  ComplianceApprovalItem,
  ComplianceApprovalType,
  ComplianceApprovalStatus,
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

  // ---- Stage 4A: unified compliance dashboard aggregate ----
  complianceDashboard: (params: ComplianceDashboardFilters = {}) =>
    adminApiFetch<ComplianceDashboard>(
      `/compliance/dashboard${buildQuery({ ...params })}`,
      'GET',
    ),

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

  // ---- Stage 5: full user profile aggregate ----
  userProfile: (userId: string) =>
    adminApiFetch<UserProfile>(`/users/${userId}/profile`, 'GET'),

  userProfileSection: <T>(
    userId: string,
    section: ProfileSection,
    params: { cursor?: string; limit?: number } = {},
  ) =>
    adminApiFetch<ProfilePage<T>>(
      `/users/${userId}/profile/sections/${section}${buildQuery({ ...params })}`,
      'GET',
    ),

  revokeUserSession: (userId: string, sessionId: string) =>
    adminApiFetch<{ revoked: boolean }>(
      `/users/${userId}/sessions/${sessionId}/revoke`,
      'POST',
    ),

  userComplianceNotes: (
    userId: string,
    params: { cursor?: string; limit?: number } = {},
  ) =>
    adminApiFetch<ProfilePage<ProfileComplianceNote>>(
      `/users/${userId}/compliance-notes${buildQuery({ ...params })}`,
      'GET',
    ),

  addUserComplianceNote: (userId: string, body: string) =>
    adminApiFetch<ProfileComplianceNote>(
      `/users/${userId}/compliance-notes`,
      'POST',
      { body: { body } },
    ),

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

  // ---- per-user feature controls (User Control Center) ----
  userControls: (userId: string) =>
    adminApiFetch<UserFeatureControls>(`/users/${userId}/controls`, 'GET'),

  updateUserControls: (
    userId: string,
    body: Partial<Record<UserControlFlag, boolean>> & { reason: string },
  ) =>
    adminApiFetch<UserFeatureControls>(`/users/${userId}/controls`, 'PATCH', {
      body,
    }),

  userControlsAudit: (userId: string) =>
    adminApiFetch<{ items: UserControlAuditEntry[] }>(
      `/users/${userId}/controls/audit`,
      'GET',
    ),

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

  // ---- Stage 8A: admin command center ----
  commandCenter: () => adminApiFetch<CommandCenter>('/ops/command-center', 'GET'),

  // ---- Stage 8B: admin notification center ----
  adminNotifications: (params: { unreadOnly?: boolean; type?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<AdminNotificationPage>(
      `/admin-notifications${buildQuery({
        unreadOnly: params.unreadOnly ? 'true' : undefined,
        type: params.type,
        cursor: params.cursor,
        limit: params.limit,
      })}`,
      'GET',
    ),
  adminNotificationMarkRead: (id: string) =>
    adminApiFetch<{ updated: boolean }>(`/admin-notifications/${id}/read`, 'PATCH'),
  adminNotificationMarkAllRead: () =>
    adminApiFetch<{ updated: number }>('/admin-notifications/read-all', 'PATCH'),

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

  // ---- monitoring + STR cases (Stage 5.2) ----
  complianceCaseSummary: () =>
    adminApiFetch<ComplianceCaseSummary>('/compliance/cases/summary', 'GET'),

  complianceCases: (
    params: {
      status?: ComplianceCaseStatus;
      priority?: ComplianceCasePriority;
      type?: ComplianceCaseType;
      cursor?: string;
      limit?: number;
    } = {},
  ) =>
    adminApiFetch<{ items: ComplianceCaseListItem[]; nextCursor: string | null }>(
      `/compliance/cases${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  complianceCase: (caseId: string) =>
    adminApiFetch<ComplianceCaseDetail>(`/compliance/cases/${caseId}`, 'GET'),

  complianceCaseCreate: (body: {
    userId: string;
    type?: ComplianceCaseType;
    priority?: ComplianceCasePriority;
    title: string;
    summary?: string;
    alertIds?: string[];
  }) => adminApiFetch<ComplianceCaseDetail>('/compliance/cases', 'POST', { body }),

  complianceCaseAssign: (caseId: string, adminId: string | null) =>
    adminApiFetch<ComplianceCaseDetail>(`/compliance/cases/${caseId}/assign`, 'POST', { body: { adminId } }),

  complianceCaseStatus: (caseId: string, body: { status: ComplianceCaseStatus; note?: string }) =>
    adminApiFetch<ComplianceCaseDetail>(`/compliance/cases/${caseId}/status`, 'POST', { body }),

  complianceCaseNote: (caseId: string, body: string) =>
    adminApiFetch<ComplianceCaseDetail>(`/compliance/cases/${caseId}/note`, 'POST', { body: { body } }),

  complianceCaseExportStr: (caseId: string) =>
    adminDownload(`/compliance/cases/${caseId}/export-str-draft`, `str-draft-${caseId}.json`),

  complianceAlerts: (params: { userId?: string; status?: ComplianceAlertStatus } = {}) =>
    adminApiFetch<{ items: ComplianceAlertItem[] }>(
      `/compliance/alerts${buildQuery({ ...params })}`,
      'GET',
    ),

  complianceAlertLinkCase: (alertId: string, caseId: string) =>
    adminApiFetch<ComplianceCaseDetail>(`/compliance/alerts/${alertId}/link-case`, 'POST', { body: { caseId } }),

  complianceAlertStatus: (alertId: string, body: { status: ComplianceAlertStatus; note?: string }) =>
    adminApiFetch<ComplianceAlertItem>(`/compliance/alerts/${alertId}/status`, 'POST', { body }),

  complianceMonitoringRun: (userId?: string) =>
    adminApiFetch<MonitoringRunResult>('/compliance/monitoring/run', 'POST', {
      body: userId ? { userId } : {},
    }),

  // ---- wallet risk + Travel Rule (Stage 5.3) ----
  walletRiskSummary: () =>
    adminApiFetch<WalletRiskSummary>('/compliance/wallet-risk/summary', 'GET'),

  walletRiskProfiles: (params: { level?: WalletRiskLevel; status?: WalletRiskStatus; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: WalletRiskProfileItem[]; nextCursor: string | null }>(
      `/compliance/wallet-risk/profiles${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  walletRiskProfile: (profileId: string) =>
    adminApiFetch<WalletRiskProfileDetail>(`/compliance/wallet-risk/profiles/${profileId}`, 'GET'),

  walletRiskChecks: (params: { userId?: string; status?: WalletRiskStatus; chain?: string; address?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: WalletRiskCheckItem[]; nextCursor: string | null }>(
      `/compliance/wallet-risk/checks${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  walletRiskRun: (body: { chain: string; address: string; userId?: string; direction?: TravelRuleDirection }) =>
    adminApiFetch<{ check: WalletRiskCheckItem; profileId: string; created: boolean }>(
      '/compliance/wallet-risk/run',
      'POST',
      { body },
    ),

  walletRiskReview: (checkId: string, body: { decision: WalletRiskStatus; level?: WalletRiskLevel; note?: string }) =>
    adminApiFetch<WalletRiskCheckItem>(`/compliance/wallet-risk/checks/${checkId}/review`, 'POST', { body }),

  travelRuleTransfers: (params: { status?: TravelRuleStatus; direction?: TravelRuleDirection; userId?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: TravelRuleTransferItem[]; nextCursor: string | null }>(
      `/compliance/travel-rule${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  travelRuleTransfer: (transferId: string) =>
    adminApiFetch<TravelRuleTransferItem>(`/compliance/travel-rule/${transferId}`, 'GET'),

  travelRuleAction: (transferId: string, body: { action: TravelRuleAction; note?: string; exemptedReason?: string }) =>
    adminApiFetch<TravelRuleTransferItem>(`/compliance/travel-rule/${transferId}/status`, 'POST', { body }),

  travelRuleExport: (transferId: string) =>
    adminDownload(`/compliance/travel-rule/${transferId}/export`, `travel-rule-mock-${transferId}.json`),

  // ---- evidence packs + retention (Stage 5.4) ----
  evidencePacks: (params: { packType?: EvidencePackType; status?: EvidencePackStatus; scopeUserId?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: EvidencePackListItem[]; nextCursor: string | null }>(
      `/compliance/evidence-packs${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  evidencePack: (packId: string) =>
    adminApiFetch<EvidencePackDetail>(`/compliance/evidence-packs/${packId}`, 'GET'),

  evidencePackCreate: (body: { packType: EvidencePackType; userId?: string; caseId?: string; ref?: string; format?: 'JSON' | 'PDF_PLACEHOLDER' }) =>
    adminApiFetch<EvidencePackDetail>('/compliance/evidence-packs', 'POST', { body }),

  evidencePackExport: (packId: string) =>
    adminDownload(`/compliance/evidence-packs/${packId}/export`, `evidence-pack-${packId}.json`),

  retentionPolicies: () =>
    adminApiFetch<{ items: RetentionPolicy[] }>('/compliance/retention/policies', 'GET'),

  retentionPolicyUpsert: (body: { recordType: string; retentionYears: number; status?: 'ACTIVE' | 'DISABLED'; description?: string }) =>
    adminApiFetch<RetentionPolicy>('/compliance/retention/policies', 'POST', { body }),

  retentionReviews: (params: { recordType?: string; status?: RetentionReviewStatus; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: RetentionReview[]; nextCursor: string | null }>(
      `/compliance/retention/reviews${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  retentionReviewStatus: (reviewId: string, body: { status: 'REVIEWED' | 'ESCALATED'; notes?: string }) =>
    adminApiFetch<RetentionReview>(`/compliance/retention/reviews/${reviewId}/status`, 'POST', { body }),

  complianceExportEvents: (params: { cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: ComplianceExportEventItem[]; nextCursor: string | null }>(
      `/compliance/exports/events${buildQuery({ limit: 50, ...params })}`,
      'GET',
    ),

  // ---- tax / legal (Stage 5.5) ----
  taxRules: () => adminApiFetch<{ items: TaxRule[] }>('/tax/rules', 'GET'),
  taxRuleUpsert: (body: { eventType: TaxEventType; name: string; rateBps: number; thresholdAmount?: number; status?: TaxRuleStatus; description?: string }) =>
    adminApiFetch<TaxRule>('/tax/rules', 'POST', { body }),
  taxTdsRecords: (params: { userId?: string; eventType?: TaxEventType; financialYear?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: TdsRecordItem[]; nextCursor: string | null }>(`/tax/tds-records${buildQuery({ limit: 50, ...params })}`, 'GET'),
  taxStatementsAdmin: (params: { userId?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: TaxStatementItem[]; nextCursor: string | null }>(`/tax/statements${buildQuery({ limit: 50, ...params })}`, 'GET'),
  taxStatementGenerate: (body: { userId: string; financialYear?: string; events?: Array<{ eventType: TaxEventType; grossAmount: number; asset?: string; sourceRef?: string }> }) =>
    adminApiFetch<TaxStatementItem>('/tax/statements/generate', 'POST', { body }),
  legalDocuments: (params: { type?: LegalDocumentType } = {}) =>
    adminApiFetch<{ items: LegalDocument[] }>(`/legal/documents${buildQuery({ ...params })}`, 'GET'),
  legalDocumentCreate: (body: { type: LegalDocumentType; version: string; title: string; content: string }) =>
    adminApiFetch<LegalDocument>('/legal/documents', 'POST', { body }),
  legalAcceptancesAdmin: (params: { userId?: string; documentType?: LegalDocumentType; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: LegalAcceptanceItem[]; nextCursor: string | null }>(`/legal/acceptances${buildQuery({ limit: 50, ...params })}`, 'GET'),

  // ---- FIU draft reporting (Stage 5.6) ----
  fiuReports: (params: { reportType?: FiuReportType; status?: FiuDraftStatus; scopeUserId?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: FiuReportListItem[]; nextCursor: string | null }>(`/compliance/fiu/draft-reports${buildQuery({ limit: 50, ...params })}`, 'GET'),
  fiuReport: (reportId: string) => adminApiFetch<FiuReportDetail>(`/compliance/fiu/draft-reports/${reportId}`, 'GET'),
  fiuReportCreate: (body: { reportType: FiuReportType; scopeType: FiuReportScopeType; userId?: string; caseId?: string; evidencePackId?: string; narrative?: string }) =>
    adminApiFetch<FiuReportDetail>('/compliance/fiu/draft-reports', 'POST', { body }),
  fiuReportValidate: (reportId: string) => adminApiFetch<FiuReportDetail>(`/compliance/fiu/draft-reports/${reportId}/validate`, 'POST'),
  fiuReportStatus: (reportId: string, body: { status: FiuDraftStatus }) =>
    adminApiFetch<FiuReportListItem>(`/compliance/fiu/draft-reports/${reportId}/status`, 'POST', { body }),
  fiuReportExport: (reportId: string) => adminDownload(`/compliance/fiu/draft-reports/${reportId}/export`, `fiu-draft-${reportId}.json`),
  fiuExportEvents: (params: { cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: FiuExportEventItem[]; nextCursor: string | null }>(`/compliance/fiu/exports${buildQuery({ limit: 50, ...params })}`, 'GET'),

  // ---- AML policy + compliance workspace (Stage 5.7) ----
  amlPolicies: () => adminApiFetch<{ items: AmlPolicyListItem[] }>('/compliance/aml/policies', 'GET'),
  amlPolicy: (policyId: string) => adminApiFetch<AmlPolicyDetail>(`/compliance/aml/policies/${policyId}`, 'GET'),
  amlPolicyCreate: (body: { version: string; name: string; description?: string }) =>
    adminApiFetch<AmlPolicyListItem>('/compliance/aml/policies', 'POST', { body }),
  amlPolicyActivate: (policyId: string) => adminApiFetch<AmlPolicyListItem>(`/compliance/aml/policies/${policyId}/activate`, 'POST'),
  amlRuleCreate: (policyId: string, body: { ruleType: AmlRuleType; name: string; severity?: AmlRuleSeverity; action?: AmlRuleAction; conditionKey?: string; operator?: string; thresholdValue?: string; description?: string }) =>
    adminApiFetch<AmlRule>(`/compliance/aml/policies/${policyId}/rules`, 'POST', { body }),
  amlRulePatch: (ruleId: string, body: Partial<{ name: string; severity: AmlRuleSeverity; action: AmlRuleAction; conditionKey: string; operator: string; thresholdValue: string; enabled: boolean }>) =>
    adminApiFetch<AmlRule>(`/compliance/aml/rules/${ruleId}`, 'PATCH', { body }),
  amlEvaluate: (body: { policyId?: string; context: Record<string, unknown> }) =>
    adminApiFetch<AmlEvaluationResult>('/compliance/aml/evaluate', 'POST', { body }),

  workspaceSummary: () => adminApiFetch<WorkspaceSummary>('/compliance/workspace/summary', 'GET'),
  workspaceTasks: (params: { status?: ComplianceTaskStatus; type?: ComplianceTaskType; assignedToAdminId?: string; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: ComplianceTaskListItem[]; nextCursor: string | null }>(`/compliance/workspace/tasks${buildQuery({ limit: 50, ...params })}`, 'GET'),
  workspaceTask: (taskId: string) => adminApiFetch<ComplianceTaskDetail>(`/compliance/workspace/tasks/${taskId}`, 'GET'),
  workspaceTaskCreate: (body: { type: ComplianceTaskType; title: string; description?: string; priority?: ComplianceTaskPriority; slaMinutes?: number; scopeUserId?: string; caseId?: string; alertId?: string; walletRiskCheckId?: string; fiuReportId?: string; evidencePackId?: string }) =>
    adminApiFetch<ComplianceTaskDetail>('/compliance/workspace/tasks', 'POST', { body }),
  workspaceTaskAssign: (taskId: string, adminId: string | null) =>
    adminApiFetch<ComplianceTaskDetail>(`/compliance/workspace/tasks/${taskId}/assign`, 'POST', { body: { adminId } }),
  workspaceTaskStatus: (taskId: string, body: { status: ComplianceTaskStatus; note?: string }) =>
    adminApiFetch<ComplianceTaskDetail>(`/compliance/workspace/tasks/${taskId}/status`, 'POST', { body }),
  workspaceTaskComment: (taskId: string, body: string) =>
    adminApiFetch<ComplianceTaskDetail>(`/compliance/workspace/tasks/${taskId}/comment`, 'POST', { body: { body } }),
  workspaceTaskEvents: (taskId: string) => adminApiFetch<{ items: ComplianceTaskEventItem[] }>(`/compliance/workspace/tasks/${taskId}/events`, 'GET'),

  checklistTemplates: (taskType?: ComplianceTaskType) =>
    adminApiFetch<{ items: AmlChecklistTemplate[] }>(`/compliance/workspace/checklists/templates${taskType ? `?taskType=${taskType}` : ''}`, 'GET'),
  checklistTemplateCreate: (body: { taskType: ComplianceTaskType; name: string; version?: string; items: Array<{ key: string; label: string; required?: boolean }>; requiredForCompletion?: boolean }) =>
    adminApiFetch<AmlChecklistTemplate>('/compliance/workspace/checklists/templates', 'POST', { body }),
  taskChecklist: (taskId: string) =>
    adminApiFetch<{ taskId: string; templates: AmlChecklistTemplate[]; responses: Array<{ id: string; templateId: string | null; answers: unknown; completed: boolean }> }>(`/compliance/workspace/tasks/${taskId}/checklist`, 'GET'),
  taskChecklistSave: (taskId: string, body: { templateId?: string; answers: Array<{ key: string; value: unknown; note?: string }>; complete?: boolean }) =>
    adminApiFetch<unknown>(`/compliance/workspace/tasks/${taskId}/checklist`, 'POST', { body }),

  approvals: (params: { status?: ComplianceApprovalStatus; approvalType?: ComplianceApprovalType; cursor?: string; limit?: number } = {}) =>
    adminApiFetch<{ items: ComplianceApprovalItem[]; nextCursor: string | null }>(`/compliance/workspace/approvals${buildQuery({ limit: 50, ...params })}`, 'GET'),
  approval: (approvalId: string) => adminApiFetch<ComplianceApprovalItem>(`/compliance/workspace/approvals/${approvalId}`, 'GET'),
  approvalCreate: (body: { approvalType: ComplianceApprovalType; title: string; reason?: string; targetType?: string; targetId?: string; taskId?: string }) =>
    adminApiFetch<ComplianceApprovalItem>('/compliance/workspace/approvals', 'POST', { body }),
  approvalApprove: (approvalId: string, note?: string) =>
    adminApiFetch<ComplianceApprovalItem>(`/compliance/workspace/approvals/${approvalId}/approve`, 'POST', { body: { note } }),
  approvalReject: (approvalId: string, note?: string) =>
    adminApiFetch<ComplianceApprovalItem>(`/compliance/workspace/approvals/${approvalId}/reject`, 'POST', { body: { note } }),
};
