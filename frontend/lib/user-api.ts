import { USER_API_URL } from './config';
import { apiFetch, ApiError, type Envelope } from './api';
import { tokenStore } from './auth';
import type {
  Candles,
  CandleInterval,
  Conversion,
  ConversionSide,
  CryptoWithdrawal,
  DepositAddress,
  InrDeposit,
  InrDepositIntent,
  KycDocument,
  KycDocumentUpload,
  KycProfile,
  LedgerEntry,
  LoginData,
  Market,
  MeData,
  Order,
  OrderBook,
  OrderStatus,
  Page,
  PlaceOrderInput,
  PublicTrade,
  Quote,
  RegisterData,
  SubmitKycInput,
  Ticker,
  Trade,
  UserCryptoDeposit,
  Wallet,
  WalletOverview,
  WithdrawalAddress,
} from './types';

/** Fresh idempotency key per money-moving request (replays dedupe server-side). */
function idemKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Exchange the stored refresh token for a fresh pair. Returns success flag. */
async function tryRefresh(): Promise<boolean> {
  const refresh = tokenStore.getUserRefresh();
  if (!refresh) return false;
  try {
    const res = await apiFetch<{ tokens: { accessToken: string; refreshToken: string } }>(
      USER_API_URL,
      '/auth/refresh',
      { method: 'POST', body: { refreshToken: refresh } },
    );
    tokenStore.setUser(res.data.tokens.accessToken, res.data.tokens.refreshToken);
    return true;
  } catch {
    tokenStore.clearUser();
    return false;
  }
}

/** Authenticated request with a single transparent refresh-and-retry on 401. */
async function authed<T>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Envelope<T>> {
  try {
    return await apiFetch<T>(USER_API_URL, path, {
      ...opts,
      token: tokenStore.getUserAccess(),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && (await tryRefresh())) {
      return apiFetch<T>(USER_API_URL, path, {
        ...opts,
        token: tokenStore.getUserAccess(),
      });
    }
    throw err;
  }
}

export const userApi = {
  register: (body: { email: string; password: string; phone?: string }) =>
    apiFetch<RegisterData>(USER_API_URL, '/auth/register', { method: 'POST', body }),

  login: (body: { email: string; password: string }) =>
    apiFetch<LoginData>(USER_API_URL, '/auth/login', { method: 'POST', body }),

  /** Redeem the one-time OAuth code (from /auth/callback) for a normal session. */
  oauthExchange: (body: { code: string }) =>
    apiFetch<LoginData>(USER_API_URL, '/auth/oauth/exchange', { method: 'POST', body }),

  forgotPassword: (body: { email: string }) =>
    apiFetch<void>(USER_API_URL, '/auth/forgot-password', { method: 'POST', body }),

  resetPassword: (body: { token: string; password: string }) =>
    apiFetch<void>(USER_API_URL, '/auth/reset-password', { method: 'POST', body }),

  verifyEmail: (body: { token: string }) =>
    apiFetch<void>(USER_API_URL, '/auth/verify-email', { method: 'POST', body }),

  resendVerification: (body: { email: string }) =>
    apiFetch<void>(USER_API_URL, '/auth/resend-verification', { method: 'POST', body }),

  me: () => authed<MeData>('/auth/me'),

  getKyc: () => authed<KycProfile>('/kyc'),

  submitKyc: (body: SubmitKycInput) =>
    authed<KycProfile>('/kyc', { method: 'POST', body }),

  refreshKyc: () =>
    authed<KycProfile>('/kyc/refresh', { method: 'POST' }),

  listDocuments: () => authed<{ items: KycDocument[] }>('/kyc/documents'),

  submitDocument: (body: { docType: string; sha256: string; contentType: string }) =>
    authed<KycDocumentUpload>('/kyc/documents', { method: 'POST', body }),

  // ---- wallet ----
  walletOverview: () => authed<WalletOverview>('/wallets/overview'),

  wallet: (asset: string) => authed<Wallet>(`/wallets/${asset}`),

  listDepositAddresses: () =>
    authed<{ items: DepositAddress[] }>('/wallets/addresses'),

  createDepositAddress: (chain: string) =>
    authed<DepositAddress>('/wallets/addresses', {
      method: 'POST',
      body: { chain },
      headers: { 'Idempotency-Key': idemKey() },
    }),

  /** The caller's crypto deposit history/status (detected → credited). */
  listCryptoDeposits: () =>
    authed<Page<UserCryptoDeposit>>('/wallets/deposits'),

  // ---- INR deposit (Razorpay mock order) ----
  createInrDeposit: (amount: string) =>
    authed<InrDepositIntent>('/inr/deposits', {
      method: 'POST',
      body: { amount },
      headers: { 'Idempotency-Key': idemKey() },
    }),

  listInrDeposits: () => authed<Page<InrDeposit>>('/inr/deposits'),

  // ---- conversion ----
  createQuote: (side: ConversionSide, amount: string) =>
    authed<Quote>('/inr/quotes', { method: 'POST', body: { side, amount } }),

  convert: (quoteId: string) =>
    authed<Conversion>('/inr/conversions', {
      method: 'POST',
      body: { quoteId },
      headers: { 'Idempotency-Key': idemKey() },
    }),

  listConversions: () => authed<Page<Conversion>>('/inr/conversions'),

  // ---- withdrawal ----
  listWithdrawalAddresses: () =>
    authed<{ items: WithdrawalAddress[] }>('/withdrawals/addresses'),

  addWithdrawalAddress: (body: { chain: string; address: string; label?: string }) =>
    authed<WithdrawalAddress>('/withdrawals/addresses', { method: 'POST', body }),

  createWithdrawal: (toAddress: string, amount: string) =>
    authed<CryptoWithdrawal>('/withdrawals', {
      method: 'POST',
      body: { toAddress, amount },
      headers: { 'Idempotency-Key': idemKey() },
    }),

  listWithdrawals: () => authed<Page<CryptoWithdrawal>>('/withdrawals'),

  // ---- wallet ledger (portfolio activity) ----
  walletLedger: (asset: string, limit = 20) =>
    authed<Page<LedgerEntry>>(
      `/wallets/${asset}/ledger?limit=${limit}`,
    ),

  // ---- spot trading ----
  // Public market data (no auth required, but authed() is harmless).
  listMarkets: () => apiFetch<{ items: Market[] }>(USER_API_URL, '/markets'),

  orderBook: (symbol: string, depth = 50) =>
    apiFetch<OrderBook>(
      USER_API_URL,
      `/markets/${encodeURIComponent(symbol)}/orderbook?depth=${depth}`,
    ),

  // Public market data for charts (no auth required).
  ticker: (symbol: string) =>
    apiFetch<Ticker>(USER_API_URL, `/markets/${encodeURIComponent(symbol)}/ticker`),

  candles: (symbol: string, interval: CandleInterval, limit = 200) =>
    apiFetch<Candles>(
      USER_API_URL,
      `/markets/${encodeURIComponent(symbol)}/candles?interval=${interval}&limit=${limit}`,
    ),

  marketTrades: (symbol: string, limit = 50) =>
    apiFetch<{ items: PublicTrade[] }>(
      USER_API_URL,
      `/markets/${encodeURIComponent(symbol)}/trades?limit=${limit}`,
    ),

  // Order placement carries an Idempotency-Key so retries dedupe server-side.
  placeOrder: (body: PlaceOrderInput) =>
    authed<Order>('/orders', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idemKey() },
    }),

  cancelOrder: (orderId: string) =>
    authed<Order>(`/orders/${orderId}`, { method: 'DELETE' }),

  openOrders: (symbol?: string, limit = 50) =>
    authed<Page<Order>>(
      `/orders/open?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`,
    ),

  orderHistory: (opts: { symbol?: string; status?: OrderStatus; limit?: number } = {}) => {
    const params = new URLSearchParams({ limit: String(opts.limit ?? 50) });
    if (opts.symbol) params.set('symbol', opts.symbol);
    if (opts.status) params.set('status', opts.status);
    return authed<Page<Order>>(`/orders?${params.toString()}`);
  },

  tradeHistory: (symbol?: string, limit = 50) =>
    authed<Page<Trade>>(
      `/trades?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`,
    ),
};
