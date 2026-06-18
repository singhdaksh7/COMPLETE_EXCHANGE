/** Response shapes mirrored from the backend OpenAPI / DTOs. */

export interface PublicUser {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  kycStatus: string;
  kycTier: number;
  emailVerifiedAt: string | null;
  totpEnabled: boolean;
  createdAt: string;
  fullName?: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterData {
  user: PublicUser;
  emailVerificationRequired: boolean;
}

export interface LoginData {
  user: PublicUser;
  tokens: TokenPair;
}

export interface MeData {
  user: PublicUser;
  roles: string[];
  permissions: string[];
}

export interface KycProfile {
  status: string;
  tier: number;
  fullName: string | null;
  rejectedReason: string | null;
  reviewedAt: string | null;
  // Phase 2 provider additions
  provider?: string | null;
  livenessStatus?: string | null;
  documentStatus?: string | null;
  riskScore?: number | null;
  panMasked?: string | null;
  aadhaarMasked?: string | null;
}

export interface KycSessionMeta {
  provider: string;
  providerSessionId: string;
  redirectUrl: string;
  expiresIn: number;
}

export interface KycDocument {
  id: string;
  docType: string;
  status: string;
  createdAt: string;
}

export interface KycDocumentUpload {
  documentId: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface SubmitKycInput {
  fullName: string;
  dob: string;
  pan: string;
  aadhaarRef?: string;
  address?: Record<string, string>;
}

// ---- admin ----
export interface PublicAdmin {
  id: string;
  email: string;
  status: string;
  totpEnabled: boolean;
  createdAt: string;
}

export interface AdminLoginData {
  tokens: TokenPair;
}

export interface AdminMeData {
  admin: PublicAdmin;
  roles: string[];
  permissions: string[];
}

export interface AdminKycQueueItem {
  userId: string;
  email: string;
  fullName: string | null;
  status: string;
  tier: number;
  submittedAt: string;
  // Phase 2 provider additions
  provider?: string | null;
  livenessStatus?: string | null;
  documentStatus?: string | null;
  riskScore?: number | null;
  panMasked?: string | null;
  aadhaarMasked?: string | null;
}

export interface AdminKycQueue {
  items: AdminKycQueueItem[];
  nextCursor: string | null;
}

// ---- shared ----
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ---- wallet ----
export interface Wallet {
  asset: string;
  available: string;
  locked: string;
  total: string;
}

export interface WalletNetwork {
  chain: string;
  family: string;
  contractAddr: string | null;
  minConfirmations: number;
  depositAddress: string | null;
  /** False when deposits on this chain are not yet scanned/credited. */
  scanned?: boolean;
}

export interface WalletOverviewAsset {
  asset: string;
  available: string;
  locked: string;
  total: string;
  networks: WalletNetwork[];
}

export interface WalletOverview {
  balances: Wallet[];
  assets: WalletOverviewAsset[];
}

export interface DepositAddress {
  id: string;
  chain: string;
  address: string;
  isActive: boolean;
  createdAt: string;
}

// ---- INR deposits (Razorpay mock) ----
export interface InrDepositIntent {
  inrTransactionId: string;
  provider: string;
  providerOrderId: string;
  keyId: string | null;
  amount: string;
  status: string;
}

export interface InrDeposit {
  id: string;
  type: string;
  amount: string;
  fee: string;
  status: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  ledgerTxnId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- conversion ----
export type ConversionSide = 'INR_TO_USDT' | 'USDT_TO_INR';

export interface Quote {
  id: string;
  side: ConversionSide;
  rate: string;
  spreadBps: number;
  expiresAt: string;
  inrAmount: string;
  usdtAmount: string;
  feeInr: string;
  tdsAmount: string;
}

export interface Conversion {
  id: string;
  side: ConversionSide;
  inrAmount: string;
  usdtAmount: string;
  rate: string;
  feeInr: string;
  tdsAmount: string;
  createdAt: string;
}

// ---- withdrawal ----
export interface WithdrawalAddress {
  id: string;
  chain: string;
  address: string;
  label: string | null;
  whitelistedAt: string | null;
  usable: boolean;
  createdAt: string;
}

export interface CryptoWithdrawal {
  id: string;
  userId: string;
  chain: string;
  asset: string;
  toAddress: string;
  fromAddress: string | null;
  amount: string;
  fee: string;
  netAmount: string;
  status: string;
  txHash: string | null;
  explorerUrl: string | null;
  nonce: string | null;
  failureReason: string | null;
  requestedAt: string;
  broadcastAt: string | null;
  completedAt: string | null;
}

/** User-facing crypto deposit (GET /wallets/deposits). */
export interface UserCryptoDeposit {
  id: string;
  chain: string;
  asset: string;
  amount: string;
  status: string;
  txHash: string;
  confirmations: number;
  requiredConfirmations: number;
  explorerUrl: string | null;
  detectedAt: string;
  creditedAt: string | null;
}

// ---- spot trading ----
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  tickSize: string;
  stepSize: string;
  minNotional: string;
  makerFeeBps: number;
  takerFeeBps: number;
}

export interface OrderBookLevel {
  price: string;
  quantity: string;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface OrderFill {
  tradeId: string;
  price: string;
  quantity: string;
  quoteAmount: string;
}

export interface Order {
  id: string;
  marketSymbol: string;
  side: OrderSide;
  type: OrderType;
  tif: string;
  price: string | null;
  quantity: string | null;
  quoteBudget: string | null;
  filledQuantity: string;
  quoteSpent: string;
  lockedAsset: string | null;
  lockedAmount: string | null;
  status: OrderStatus;
  clientOrderId: string | null;
  createdAt: string;
  closedAt: string | null;
  fills?: OrderFill[];
}

export interface Trade {
  id: string;
  marketSymbol: string;
  price: string;
  quantity: string;
  quoteAmount: string;
  side: OrderSide;
  role: 'MAKER' | 'TAKER' | null;
  fee: string | null;
  feeAsset: string | null;
  makerSide: OrderSide;
  executedAt: string;
}

// ---- public market data (charts) ----
export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

/** A single public tape print — no user/fee data (mirrors trade.executed). */
export interface PublicTrade {
  id: string;
  price: string;
  quantity: string;
  side: OrderSide; // maker's side
  executedAt: string;
}

export interface Candle {
  openTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVolume: string;
  quoteVolume: string;
  tradeCount: number;
}

export interface Candles {
  symbol: string;
  interval: CandleInterval;
  candles: Candle[];
}

export interface Ticker {
  symbol: string;
  lastPrice: string | null;
  high24h: string | null;
  low24h: string | null;
  open24h: string | null;
  priceChange: string;
  priceChangePct: string;
  baseVolume24h: string;
  quoteVolume24h: string;
  tradeCount24h: number;
}

/** Body for POST /orders. Fields are conditional on side/type (see backend). */
export interface PlaceOrderInput {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price?: string;
  quantity?: string;
  quoteBudget?: string;
}

// ---- ledger ----
export interface LedgerEntry {
  id: string;
  txnId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  asset: string;
  kind: string;
  createdAt: string;
}

// ---- admin: scanner ----
export interface ScannerHealth {
  chain: string;
  provider: { name: string; mode: string };
  headBlock: string | null;
  cursor: {
    lastScannedBlock: string;
    lastScannedHash: string | null;
    safeBlock: string;
    updatedAt: string;
  } | null;
  lagBlocks: string | null;
  depositCounts: Record<string, number>;
}

export interface CryptoDeposit {
  id: string;
  userId: string | null;
  chain: string;
  asset: string;
  txHash: string;
  logIndex: number;
  fromAddress: string | null;
  amount: string;
  amountBase: string;
  confirmations: number;
  reqConfirmations: number;
  status: string;
  blockNumber: string | null;
  blockHash: string | null;
  creditedTxnId: string | null;
  detectedAt: string;
  creditedAt: string | null;
}
