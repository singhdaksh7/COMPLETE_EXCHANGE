import { apiFetch, authedFetch } from './client';
import type {
  AcceptedPolicies,
  ConsentStatus,
  CreateInrWithdrawalInput,
  CreateManualDepositInput,
  CryptoWithdrawal,
  DepositAddress,
  EmailVerificationConfirmData,
  EmailVerificationRequestData,
  FederatedLoginOutcome,
  FederatedProvider,
  InrDeposit,
  InrDepositInstructions,
  InrWithdrawal,
  KycDocumentDto,
  KycDocumentUploadDto,
  KycProfile,
  LedgerEntry,
  LegalAcceptanceItem,
  LegalDocument,
  LegalDocumentType,
  LoginData,
  LoginResult,
  Market,
  MarketDataSymbolMeta,
  MarketDataTickerLookup,
  MeData,
  NotificationList,
  Order,
  OrderBook,
  OrderStatus,
  Page,
  PlaceOrderInput,
  RegisterData,
  StepUpData,
  SubmitKycDocumentInput,
  SubmitKycInput,
  SupportTicketSummaryPage,
  SupportTicketThread,
  Ticker,
  Trade,
  TwoFaConfirmData,
  TwoFaSetupData,
  TwoFaStatusData,
  UserCompliance,
  UserCryptoDeposit,
  UserSession,
  Wallet,
  WalletOverview,
  WithdrawalAddress,
} from '@/types/api';

/** Fresh idempotency key per money-moving request (server dedupes replays). */
function idemKey(): string {
  // global.crypto.randomUUID exists on Hermes (RN 0.74+); fall back otherwise.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The user-facing EXORA API surface for the mobile app. This is a strict subset
 * of the backend — ONLY normal user/trader endpoints. No admin, compliance
 * officer, RBAC, STR, wallet-risk, or Travel Rule admin calls exist here.
 */
export const userApi = {
  // ---- auth ----
  register: (body: {
    email: string;
    password: string;
    phone?: string;
    acceptedPolicies: AcceptedPolicies;
  }) => apiFetch<RegisterData>('/auth/register', { method: 'POST', body }),

  // NOTE: `location` is typed `| null` because callers use null to mean "not
  // captured yet", but the backend's zod schema is `.optional()` (undefined),
  // not `.nullable()` — an explicit `location: null` in the JSON body fails
  // validation ("Expected object, received null") before the LOCATION_REQUIRED
  // business check ever runs. Every call below normalizes null -> undefined so
  // JSON.stringify omits the key instead of encoding a literal null.
  login: (body: { email: string; password: string; location?: { latitude: number; longitude: number; accuracy: number } | null }) =>
    apiFetch<LoginResult>('/auth/login', {
      method: 'POST',
      body: { ...body, location: body.location ?? undefined },
    }),

  /** Second step of a 2FA-gated login: challenge token + TOTP/backup code. */
  verify2fa: (challengeToken: string, code: string, location?: { latitude: number; longitude: number; accuracy: number } | null) =>
    apiFetch<LoginData>('/auth/2fa/verify', {
      method: 'POST',
      body: { challengeToken, code, location: location ?? undefined },
    }),

  // ---- Federated identity: Google/Apple via Firebase (Stage 12) ----
  federatedLogin: (body: {
    idToken: string;
    provider: FederatedProvider;
    location?: { latitude: number; longitude: number; accuracy: number } | null;
  }) =>
    apiFetch<FederatedLoginOutcome>('/auth/federated/firebase', {
      method: 'POST',
      body: { ...body, location: body.location ?? undefined },
    }),

  federatedRequestLinkOtp: (challengeToken: string) =>
    apiFetch<{ sent: true }>('/auth/federated/link/request-otp', {
      method: 'POST',
      body: { challengeToken },
    }),

  federatedConfirmLink: (
    challengeToken: string,
    otp: string,
    location?: { latitude: number; longitude: number; accuracy: number } | null,
  ) =>
    apiFetch<FederatedLoginOutcome>('/auth/federated/link/confirm', {
      method: 'POST',
      body: { challengeToken, otp, location: location ?? undefined },
    }),

  federatedCompleteRegistration: (body: {
    challengeToken: string;
    phone: string;
    acceptedPolicies: AcceptedPolicies;
    location?: { latitude: number; longitude: number; accuracy: number } | null;
  }) =>
    apiFetch<FederatedLoginOutcome>('/auth/federated/register/complete', {
      method: 'POST',
      body: { ...body, location: body.location ?? undefined },
    }),

  verifyEmail: (body: { token: string }) =>
    apiFetch<void>('/auth/verify-email', { method: 'POST', body }),

  resendVerification: (body: { email: string }) =>
    apiFetch<void>('/auth/resend-verification', { method: 'POST', body }),

  // ---- OTP-code email verification — mobile's primary verification path
  // (a clickable email link can't drive this native app without deep-linking
  // infrastructure this project doesn't have; same verified account state). ----
  requestEmailVerification: (email: string) =>
    apiFetch<EmailVerificationRequestData>('/auth/email-verification/request', {
      method: 'POST',
      body: { email },
    }),

  confirmEmailVerification: (email: string, otp: string) =>
    apiFetch<EmailVerificationConfirmData>('/auth/email-verification/confirm', {
      method: 'POST',
      body: { email, otp },
    }),

  me: () => authedFetch<MeData>('/auth/me'),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    authedFetch<void>('/auth/change-password', { method: 'POST', body }),

  listSessions: () => authedFetch<{ items: UserSession[] }>('/auth/sessions'),

  revokeSession: (sessionId: string) =>
    authedFetch<void>(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),

  // ---- 2FA / MFA (TOTP) + step-up (Stage 3) ----
  get2faStatus: () => authedFetch<TwoFaStatusData>('/security/2fa/status'),
  setup2fa: () => authedFetch<TwoFaSetupData>('/security/2fa/setup', { method: 'POST' }),
  confirm2fa: (code: string) =>
    authedFetch<TwoFaConfirmData>('/security/2fa/confirm', { method: 'POST', body: { code } }),
  disable2fa: (password: string, code: string) =>
    authedFetch<{ disabled: true }>('/security/2fa/disable', {
      method: 'POST',
      body: { password, code },
    }),
  regenerateBackupCodes: (code: string) =>
    authedFetch<{ backupCodes: string[] }>('/security/2fa/backup-codes/regenerate', {
      method: 'POST',
      body: { code },
    }),
  /** Verify a fresh factor (TOTP/backup if 2FA on, else password) → step-up token. */
  stepUp: (input: { password?: string; code?: string }) =>
    authedFetch<StepUpData>('/security/step-up', { method: 'POST', body: input }),

  // ---- portfolio / wallet ----
  walletOverview: () => authedFetch<WalletOverview>('/wallets/overview'),
  wallet: (asset: string) => authedFetch<Wallet>(`/wallets/${asset}`),
  listDepositAddresses: () => authedFetch<{ items: DepositAddress[] }>('/wallets/addresses'),
  createDepositAddress: (chain: string) =>
    authedFetch<DepositAddress>('/wallets/addresses', {
      method: 'POST',
      body: { chain },
      headers: { 'Idempotency-Key': idemKey() },
    }),
  listCryptoDeposits: () => authedFetch<Page<UserCryptoDeposit>>('/wallets/deposits'),
  walletLedger: (asset: string, limit = 30) =>
    authedFetch<Page<LedgerEntry>>(`/wallets/${asset}/ledger?limit=${limit}`),

  // ---- INR deposit (manual: amount + UTR, admin-approved) ----
  createManualInrDeposit: (input: CreateManualDepositInput) =>
    authedFetch<InrDeposit>('/inr/deposits/manual', {
      method: 'POST',
      body: input,
      headers: { 'Idempotency-Key': idemKey() },
    }),
  listInrDeposits: () => authedFetch<Page<InrDeposit>>('/inr/deposits'),
  /** Backend source of truth for the manual-transfer bank/UPI destination (Stage 10A). */
  inrDepositInstructions: () =>
    authedFetch<InrDepositInstructions>('/inr/deposits/instructions'),

  // ---- INR withdrawal (manual payout: UPI / bank, admin-processed) ----
  // Requires a fresh step-up token (X-Step-Up-Token) from stepUp(); the backend
  // rejects the request with STEP_UP_REQUIRED otherwise.
  createInrWithdrawal: (input: CreateInrWithdrawalInput, stepUpToken?: string) =>
    authedFetch<InrWithdrawal>('/inr/withdrawals', {
      method: 'POST',
      body: input,
      headers: {
        'Idempotency-Key': idemKey(),
        ...(stepUpToken ? { 'X-Step-Up-Token': stepUpToken } : {}),
      },
    }),
  listInrWithdrawals: () => authedFetch<Page<InrWithdrawal>>('/inr/withdrawals'),

  // ---- crypto withdrawal (DISABLED in INR-only mode; kept for parity, not
  //      surfaced in any funding screen while crypto is globally off) ----
  listWithdrawalAddresses: () =>
    authedFetch<{ items: WithdrawalAddress[] }>('/withdrawals/addresses'),
  addWithdrawalAddress: (body: { chain: string; address: string; label?: string }) =>
    authedFetch<WithdrawalAddress>('/withdrawals/addresses', { method: 'POST', body }),
  createWithdrawal: (toAddress: string, amount: string) =>
    authedFetch<CryptoWithdrawal>('/withdrawals', {
      method: 'POST',
      body: { toAddress, amount },
      headers: { 'Idempotency-Key': idemKey() },
    }),
  listWithdrawals: () => authedFetch<Page<CryptoWithdrawal>>('/withdrawals'),

  // ---- markets (public) ----
  listMarkets: () => apiFetch<{ items: Market[] }>('/markets'),
  orderBook: (symbol: string, depth = 30) =>
    apiFetch<OrderBook>(`/markets/${encodeURIComponent(symbol)}/orderbook?depth=${depth}`),
  ticker: (symbol: string) =>
    apiFetch<Ticker>(`/markets/${encodeURIComponent(symbol)}/ticker`),

  // ---- live market data (BTC/USDT, ETH/USDT, BNB/USDT, USDT/INR reference) ----
  // Distinct resource from /markets above. No direct Binance/CoinGecko calls
  // from mobile — always through EXORA's own normalized API.
  marketDataSymbols: () => apiFetch<{ items: MarketDataSymbolMeta[] }>('/market-data'),
  marketDataTickers: () => apiFetch<{ items: MarketDataTickerLookup[] }>('/market-data/tickers'),

  // ---- orders / trades ----
  placeOrder: (body: PlaceOrderInput) =>
    authedFetch<Order>('/orders', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idemKey() },
    }),
  cancelOrder: (orderId: string) =>
    authedFetch<Order>(`/orders/${orderId}`, { method: 'DELETE' }),
  openOrders: (symbol?: string, limit = 50) =>
    authedFetch<Page<Order>>(
      `/orders/open?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`,
    ),
  orderHistory: (opts: { symbol?: string; status?: OrderStatus; limit?: number } = {}) => {
    const params = new URLSearchParams({ limit: String(opts.limit ?? 50) });
    if (opts.symbol) params.set('symbol', opts.symbol);
    if (opts.status) params.set('status', opts.status);
    return authedFetch<Page<Order>>(`/orders?${params.toString()}`);
  },
  tradeHistory: (symbol?: string, limit = 50) =>
    authedFetch<Page<Trade>>(
      `/trades?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`,
    ),

  // ---- KYC / compliance ----
  getKyc: () => authedFetch<KycProfile>('/kyc'),
  complianceStatus: () => authedFetch<UserCompliance | null>('/kyc/status'),
  /**
   * POST /kyc — opens/updates the identity profile. The provider session rides
   * in the envelope `meta.session` (mirrors backend kycController.submitProfile),
   * not in `data`, so callers read `res.meta?.session as KycSessionDto | undefined`.
   */
  submitKyc: (body: SubmitKycInput) =>
    authedFetch<KycProfile>('/kyc', { method: 'POST', body }),
  refreshKyc: () => authedFetch<KycProfile>('/kyc/refresh', { method: 'POST' }),
  listKycDocuments: () => authedFetch<{ items: KycDocumentDto[] }>('/kyc/documents'),
  /** POST /kyc/documents — registers document metadata, returns a presigned upload handle. */
  submitKycDocument: (body: SubmitKycDocumentInput) =>
    authedFetch<KycDocumentUploadDto>('/kyc/documents', { method: 'POST', body }),
  /** POST /kyc/documents/:id/confirm-upload — reports the client-observed PUT outcome. */
  confirmKycDocumentUpload: (documentId: string, status: 'UPLOADED' | 'FAILED') =>
    authedFetch<KycDocumentDto>(`/kyc/documents/${encodeURIComponent(documentId)}/confirm-upload`, {
      method: 'POST',
      body: { status },
    }),

  // ---- notifications ----
  listNotifications: (cursor?: string) =>
    authedFetch<NotificationList>(
      `/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  markNotificationRead: (id: string) =>
    authedFetch<{ read: true }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    authedFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' }),

  // ---- legal / policy consent (Stage 9A) ----
  /** Public — current live versions of every legal document type. */
  legalCurrent: () => apiFetch<{ items: LegalDocument[] }>('/legal/documents/current'),
  legalAccept: (documentType: LegalDocumentType) =>
    authedFetch<LegalAcceptanceItem>('/legal/accept', { method: 'POST', body: { documentType } }),
  legalMyAcceptances: () => authedFetch<{ items: LegalAcceptanceItem[] }>('/legal/acceptances/me'),
  /** Outstanding required-policy status for the post-login consent gate. */
  consentStatus: () => authedFetch<ConsentStatus>('/legal/consent-status'),

  // ---- support tickets (Stage 9A — user's own tickets only) ----
  supportTickets: (opts: { status?: string; cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return authedFetch<SupportTicketSummaryPage>(`/support/tickets${qs ? `?${qs}` : ''}`);
  },
  supportTicket: (ticketId: string) =>
    authedFetch<SupportTicketThread>(`/support/tickets/${ticketId}`),
  supportCreateTicket: (body: {
    category: string;
    subject: string;
    message: string;
    referenceType?: string;
    referenceId?: string;
  }) =>
    authedFetch<SupportTicketThread>('/support/tickets', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idemKey() },
    }),
  supportReply: (ticketId: string, body: string) =>
    authedFetch<SupportTicketThread>(`/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: { body },
    }),
  supportCloseTicket: (ticketId: string) =>
    authedFetch<SupportTicketThread>(`/support/tickets/${ticketId}/close`, { method: 'POST' }),
};
