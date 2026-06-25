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

export interface UserSession {
  id: string;
  ip: string | null;
  device: unknown;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface UserActivityEvent {
  id: string;
  action: string;
  entityType: string | null;
  ip: string | null;
  metadata: unknown;
  occurredAt: string;
}

export interface MeData {
  user: PublicUser;
  roles: string[];
  permissions: string[];
}

/** Generic, enumeration-safe result of requesting/resending an email OTP. */
export interface OtpRequestData {
  sent: true;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}

/** Result of verifying an email OTP (login, or a just-created signup). */
export interface OtpVerifyData extends LoginData {
  isNewUser: boolean;
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

// --- Admin management (Stage 3.4B) ---
export interface AdminListItem {
  id: string;
  email: string;
  status: string;
  totpEnabled: boolean;
  roles: string[];
  ipAllowlist: string[];
  ipRestricted: boolean;
  createdAt: string;
}

export interface AdminRoleOption {
  id: string;
  name: string;
  scope: string;
  description: string | null;
  isSystem: boolean;
}

export interface CreatedAdmin {
  admin: PublicAdmin;
  role: string;
  initialPassword: string;
}

export interface AdminKycQueueItem {
  userId: string;
  email: string;
  fullName: string | null;
  status: string;
  tier: number;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectedReason: string | null;
  riskLevel: string;
  accountStatus: string;
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

export interface KycTimelineEntry {
  id: string;
  action: string;
  actorAdminId: string;
  actorEmail: string | null;
  reason: string | null;
  occurredAt: string;
}

export interface AdminKycDetail extends AdminKycQueueItem {
  dob: string | null;
  address: Record<string, string> | null;
  complianceNote: string | null;
  riskNote: string | null;
  withdrawalsBlocked: boolean;
  documents: KycDocument[];
  activity: {
    depositCount: number;
    withdrawalCount: number;
    lastDepositAt: string | null;
    lastWithdrawalAt: string | null;
  };
  timeline: KycTimelineEntry[];
}

export interface ComplianceSummary {
  counts: {
    notStarted: number;
    pending: number;
    inReview: number;
    manualReview: number;
    needsMoreInfo: number;
    approved: number;
    rejected: number;
  };
  pendingOver24h: number;
  pendingOver48h: number;
  highRiskUsers: number;
  rejectionRatePct: number | null;
  recentActions: KycTimelineEntry[];
}

export type KycDecisionBody =
  | { decision: 'APPROVE'; tier?: number; complianceNote?: string }
  | { decision: 'REJECT'; reason: string; complianceNote?: string }
  | { decision: 'REQUEST_INFO'; reason: string; complianceNote?: string };

export interface KycQueueFilters {
  cursor?: string;
  limit?: number;
  status?: string;
  email?: string;
  riskLevel?: string;
  accountStatus?: string;
  submittedFrom?: string;
  submittedTo?: string;
}

export interface AdminUserBalance {
  asset: string;
  available: string;
  locked: string;
  total: string;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  kycStatus: string;
  kycTier: number;
  accountStatus: string;
  withdrawalsBlocked: boolean;
  riskLevel: string;
  riskNote: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  balances: AdminUserBalance[];
}

/** Per-user operational feature controls (User Control Center). */
export interface UserFeatureControls {
  userId: string;
  exists: boolean;
  // Trading
  canTradeSpot: boolean;
  canPlaceBuyOrders: boolean;
  canPlaceSellOrders: boolean;
  canCancelOrders: boolean;
  // INR
  canDepositInr: boolean;
  canWithdrawInr: boolean;
  // Crypto
  canDepositCrypto: boolean;
  canWithdrawCrypto: boolean;
  // Compliance
  forceKycReview: boolean;
  requireEnhancedKyc: boolean;
  underComplianceReview: boolean;
  // Risk
  blockHighRiskActivity: boolean;
  manualReviewBeforeWithdrawal: boolean;
  notes: string | null;
  updatedByAdminId: string | null;
  updatedAt: string | null;
}

/** A single control flag (keys of UserFeatureControls that are booleans). */
export type UserControlFlag =
  | 'canTradeSpot'
  | 'canPlaceBuyOrders'
  | 'canPlaceSellOrders'
  | 'canCancelOrders'
  | 'canDepositInr'
  | 'canWithdrawInr'
  | 'canDepositCrypto'
  | 'canWithdrawCrypto'
  | 'forceKycReview'
  | 'requireEnhancedKyc'
  | 'underComplianceReview'
  | 'blockHighRiskActivity'
  | 'manualReviewBeforeWithdrawal';

export interface UserControlAuditEntry {
  id: string;
  adminId: string;
  action: string;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  occurredAt: string;
}

export interface AdminUserDetail extends AdminUserListItem {
  phone: string | null;
  phoneVerifiedAt: string | null;
  totpEnabled: boolean;
  updatedAt: string;
  kycProfile: {
    fullName: string | null;
    status: string;
    provider: string | null;
    providerRef: string | null;
    panMasked: string | null;
    aadhaarMasked: string | null;
    livenessStatus: string | null;
    documentStatus: string | null;
    riskScore: number | null;
    rejectedReason: string | null;
    reviewedAt: string | null;
  } | null;
  sessions: Array<{
    id: string;
    ip: string | null;
    deviceInfo: unknown;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
  inrTransactions: Array<{
    id: string;
    type: string;
    amount: string;
    fee: string;
    status: string;
    provider: string | null;
    utr: string | null;
    method: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
  }>;
  withdrawals: Array<{
    id: string;
    chain: string;
    asset: string;
    toAddress: string;
    amount: string;
    fee: string;
    netAmount: string;
    status: string;
    txHash: string | null;
    failureReason: string | null;
    requestedAt: string;
    completedAt: string | null;
  }>;
  orders: Array<{
    id: string;
    marketSymbol: string;
    side: string;
    type: string;
    price: string | null;
    quantity: string | null;
    quoteBudget: string | null;
    filledQuantity: string;
    quoteSpent: string;
    status: string;
    createdAt: string;
    closedAt: string | null;
  }>;
  trades: Array<{
    id: string;
    marketSymbol: string;
    price: string;
    quantity: string;
    quoteAmount: string;
    makerSide: string;
    seq: string;
    executedAt: string;
  }>;
  adminLogs: Array<{
    id: string;
    action: string;
    reason: string | null;
    beforeState: unknown;
    afterState: unknown;
    occurredAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    metadata: unknown;
    occurredAt: string;
  }>;
}

// ---- Stage 5: full user profile aggregate ----

/** Cursor-paginated slice of one profile section. */
export interface ProfilePage<T> {
  items: T[];
  nextCursor: string | null;
}

/** List sections that support cursor drill-down. */
export type ProfileSection =
  | 'inrDeposits'
  | 'inrWithdrawals'
  | 'cryptoDeposits'
  | 'cryptoWithdrawals'
  | 'orders'
  | 'trades'
  | 'sessions'
  | 'auditTrail';

export interface ProfileIdentity {
  id: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  accountStatus: string;
  kycStatus: string;
  kycTier: number;
  riskLevel: string;
  riskNote: string | null;
  withdrawalsBlocked: boolean;
  totpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileKyc {
  exists: boolean;
  status: string | null;
  tier: number;
  fullName: string | null;
  provider: string | null;
  providerRef: string | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
  livenessStatus: string | null;
  documentStatus: string | null;
  riskScore: number | null;
  rejectedReason: string | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  submittedAt: string | null;
  enhancedKycRequired: boolean;
}

export interface ProfileBalance {
  asset: string;
  available: string;
  locked: string;
  total: string;
}

export interface ProfileInrTxn {
  id: string;
  type: string;
  amount: string;
  fee: string;
  status: string;
  provider: string | null;
  method: string | null;
  utr: string | null;
  bankRef: string | null;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  firstApprovedByAdminId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileCryptoDeposit {
  id: string;
  asset: string;
  chain: string;
  amount: string;
  txHash: string;
  confirmations: number;
  reqConfirmations: number;
  status: string;
  fromAddress: string | null;
  detectedAt: string;
  creditedAt: string | null;
}

export interface ProfileCryptoWithdrawal {
  id: string;
  asset: string;
  chain: string;
  amount: string;
  fee: string;
  netAmount: string;
  toAddress: string;
  txHash: string | null;
  status: string;
  approvedByAdminId: string | null;
  approvedBy2AdminId: string | null;
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface ProfileOrder {
  id: string;
  marketSymbol: string;
  side: string;
  type: string;
  price: string | null;
  quantity: string | null;
  quoteBudget: string | null;
  filledQuantity: string;
  quoteSpent: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
}

export interface ProfileTrade {
  id: string;
  seq: string;
  marketSymbol: string;
  side: string;
  price: string;
  quantity: string;
  quoteAmount: string;
  fee: string;
  executedAt: string;
}

export interface ProfileSessionItem {
  id: string;
  ip: string | null;
  deviceInfo: unknown;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
}

export interface ProfileAuditEntry {
  id: string;
  adminId: string;
  action: string;
  targetType: string | null;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  ip: string | null;
  occurredAt: string;
}

export interface ProfileRiskFlag {
  kind: 'SCREENING' | 'WALLET_RISK' | 'ALERT';
  label: string;
  status: string;
  level: string | null;
  detail: string | null;
  createdAt: string;
}

export interface ProfileRiskCaseLink {
  id: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  createdAt: string;
}

export interface ProfileRiskCompliance {
  visible: boolean;
  screening: {
    sanctionsStatus: string;
    pepStatus: string;
    adverseMediaStatus: string;
    complianceRiskLevel: string | null;
    complianceRiskScore: number | null;
  } | null;
  manualHold: {
    underComplianceReview: boolean;
    manualReviewBeforeWithdrawal: boolean;
    blockHighRiskActivity: boolean;
    forceKycReview: boolean;
    requireEnhancedKyc: boolean;
  };
  flags: ProfileRiskFlag[];
  openCases: ProfileRiskCaseLink[];
}

export interface ProfileComplianceNote {
  id: string;
  adminId: string | null;
  body: string;
  createdAt: string;
}

export interface UserProfile {
  identity: ProfileIdentity;
  kyc: ProfileKyc;
  balances: ProfileBalance[];
  inrDeposits: ProfilePage<ProfileInrTxn>;
  inrWithdrawals: ProfilePage<ProfileInrTxn>;
  cryptoDeposits: ProfilePage<ProfileCryptoDeposit>;
  cryptoWithdrawals: ProfilePage<ProfileCryptoWithdrawal>;
  orders: ProfilePage<ProfileOrder>;
  trades: ProfilePage<ProfileTrade>;
  sessions: ProfilePage<ProfileSessionItem>;
  auditTrail: ProfilePage<ProfileAuditEntry>;
  riskCompliance: ProfileRiskCompliance;
  complianceNotes: ProfilePage<ProfileComplianceNote> | null;
  meta: {
    complianceVisible: boolean;
    canRevokeSessions: boolean;
    canManageNotes: boolean;
  };
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
  userId: string;
  type: string;
  amount: string;
  fee: string;
  status: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  ledgerTxnId: string | null;
  utr: string | null;
  method: string | null;
  proofKey: string | null;
  firstApprovedBy: string | null;
  firstApprovedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Admin operations (Stage 3.4C) ---
export interface OperationsAuditLog {
  id: string;
  actorAdminId: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  ip: string | null;
  occurredAt: string;
}

export interface OperationsSummary {
  inrDeposits: { pending: number; approved: number; rejected: number; total: number };
  withdrawals: {
    pendingTotal: string;
    completedTotal: string;
    failedRejectedCount: number;
    pendingByAsset: Array<{ asset: string; amount: string }>;
  };
  kyc: { pending: number };
  admins: { active: number; suspended: number };
  recentAdminActions: OperationsAuditLog[];
  dualApprovalThreshold: string;
}

export type ManualDepositMethod = 'UPI' | 'IMPS' | 'NEFT' | 'QR' | 'BANK';

export interface CreateManualDepositInput {
  amount: string;
  utr: string;
  method: ManualDepositMethod;
  proofKey?: string;
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
  userEmail?: string | null;
  userStatus?: string | null;
  userKycStatus?: string | null;
  userKycTier?: number | null;
  withdrawalsBlocked?: boolean | null;
  riskLevel?: string | null;
  riskNote?: string | null;
  riskFlags?: unknown;
  approvedBy?: string | null;
  approvedBy2?: string | null;
  firstApprovedAt?: string | null;
  requiresSecondApproval?: boolean;
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

// ---- notifications (Stage 4.0) ----
export type NotificationType =
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'KYC_NEEDS_MORE_INFO'
  | 'INR_DEPOSIT_SUBMITTED'
  | 'INR_DEPOSIT_APPROVED'
  | 'INR_DEPOSIT_REJECTED'
  | 'WITHDRAWAL_REQUESTED'
  | 'WITHDRAWAL_APPROVED'
  | 'WITHDRAWAL_REJECTED'
  | 'WITHDRAWAL_COMPLETED'
  | 'PASSWORD_CHANGED'
  | 'SECURITY_SESSION_REVOKED';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: Notification[];
  nextCursor: string | null;
  unread: number;
}

export interface AdminNotification {
  id: string;
  userId: string;
  email: string;
  type: NotificationType;
  title: string;
  emailStatus: string | null;
  read: boolean;
  createdAt: string;
}

// ---- admin: fee revenue reports (Stage 3.8) ----
export interface FeeAssetTotal {
  asset: string;
  amount: string;
}

export interface MarketFeeSetting {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  makerFeeBps: number;
  takerFeeBps: number;
  status: string;
}

export interface FeeReport {
  fromDate: string | null;
  toDate: string | null;
  tradingFees: { totalByAsset: FeeAssetTotal[] };
  withdrawalFees: { totalByAsset: FeeAssetTotal[]; flatFeeUsdt: string };
  ledgerFeeRevenue: { totalByAsset: FeeAssetTotal[] };
  marketFees: MarketFeeSetting[];
}

// ---- System / Ops Center (Stage 4.3) ----
export interface SystemHealth {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  dependencies: { database: 'ok' | 'degraded'; redis: 'ok' | 'degraded' };
}

export interface SystemQueues {
  pendingInrDeposits: number;
  makerCheckerPendingDeposits: number;
  pendingWithdrawals: number;
  makerCheckerPendingWithdrawals: number;
  kycPending: number;
  kycNeedsMoreInfo: number;
  highRiskUsers: number;
  frozenUsers: number;
  withdrawalsBlockedUsers: number;
}

export interface SystemMail {
  provider: 'log' | 'ses';
  fromDomain: string | null;
  replyToConfigured: boolean;
  region: string | null;
  configurationSetConfigured: boolean;
  recentFailures: number;
  statusCounts: Record<string, number>;
  windowHours: number;
}

export interface SystemScannerChain {
  chain: string;
  providerMode: string;
  lastScannedBlock: string | null;
  safeBlock: string | null;
  lastScannedHash: string | null;
  updatedAt: string | null;
}

export interface SystemScanner {
  safetyLag: number;
  reorgBuffer: number;
  startBlock: number;
  chains: SystemScannerChain[];
  recentErrors: string[];
}

export interface SystemLargeWithdrawal {
  id: string;
  userId: string;
  asset: string;
  chain: string;
  amount: string;
  status: string;
  requestedAt: string;
}

export interface SystemRiskAlerts {
  highRiskUsers: number;
  frozenUsers: number;
  lockedUsers: number;
  withdrawalsBlockedUsers: number;
  largePendingWithdrawals: {
    thresholdUsdt: string;
    count: number;
    items: SystemLargeWithdrawal[];
  };
  failedRejectedWithdrawals: number;
  depositApprovalsPendingTooLong: number;
  kycPendingTooLong: number;
  repeatedMailFailures: number;
  failedLogins: number;
  windowHours: number;
}

export interface SystemFlags {
  mailProvider: 'log' | 'ses';
  withdrawalSigner: string;
  mockProvidersAllowed: boolean;
  mockWithdrawalSignerAllowed: boolean;
  logMailProviderAllowed: boolean;
  unverifiedEmailLoginAllowed: boolean;
  adminTotpRequired: boolean;
  liveSigningEnabled: boolean;
}

export interface SystemOverview {
  status: 'ok' | 'degraded';
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  dependencies: { database: 'ok' | 'degraded'; redis: 'ok' | 'degraded' };
  summary: {
    pendingInrDeposits: number;
    pendingWithdrawals: number;
    kycPending: number;
    mailFailures: number;
  };
  scanner: {
    chains: Array<{ chain: string; providerMode: string; lastScannedBlock: string | null }>;
  };
  mail: { provider: 'log' | 'ses'; fromDomain: string | null };
  risk: {
    highRiskUsers: number;
    frozenUsers: number;
    withdrawalsBlockedUsers: number;
    largePendingWithdrawals: number;
  };
  flags: SystemFlags;
  deployment: {
    version: string;
    environment: string;
    apiPrefix: string;
    adminApiPrefix: string;
  };
}

// ---- Stage 9A: structured readiness ----
export type ReadinessStatus = 'healthy' | 'degraded' | 'unhealthy';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ReadinessCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface SystemReadiness {
  status: ReadinessStatus;
  checks: ReadinessCheck[];
  environment: string;
  version: string;
  build: { version: string; commit: string | null; builtAt: string | null; node: string };
  uptimeSeconds: number;
  timestamp: string;
}

// ---- Stage 9B: backup / restore status ----
export type BackupItemStatus = 'ok' | 'unknown' | 'action_required';

export interface BackupChecklistItem {
  key: string;
  label: string;
  status: BackupItemStatus;
  detail: string;
}

export interface BackupStatus {
  status: 'ok' | 'attention';
  database: {
    provider: string;
    automatedBackups: 'enabled' | 'disabled' | 'unknown';
    retentionDays: number | null;
  };
  latestBackup: { snapshotId: string | null; takenAt: string | null; known: boolean };
  restoreDrill: { lastTestedAt: string | null; documented: boolean };
  backupChecklist: BackupChecklistItem[];
  restoreDrillChecklist: BackupChecklistItem[];
  warnings: string[];
  notes: string | null;
  environment: string;
  timestamp: string;
}

// ---- Stage 9C: monitoring / alerts status ----
export interface MonitoringAlertItem {
  key: string;
  label: string;
  configured: boolean;
  recommendedThreshold: string;
  detail: string;
}

export interface MonitoringStatus {
  status: 'ok' | 'attention';
  configuredCount: number;
  totalCount: number;
  dashboardUrl: string | null;
  alerts: MonitoringAlertItem[];
  warnings: string[];
  environment: string;
  timestamp: string;
}

// ---- Stage 9E: security / abuse guardrails ----
export type GuardrailState = 'enforced' | 'partial' | 'planned';

export interface GuardrailItem {
  key: string;
  label: string;
  state: GuardrailState;
  detail: string;
}

export interface GuardrailsStatus {
  enforcedCount: number;
  plannedCount: number;
  totalCount: number;
  guardrails: GuardrailItem[];
  environment: string;
  timestamp: string;
}

// ---- Stage 9D: admin audit review ----
export type AuditReviewRisk = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AuditReviewItem {
  id: string;
  occurredAt: string;
  actorAdminId: string;
  actorEmail: string | null;
  action: string;
  riskLevel: AuditReviewRisk;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  ip: string | null;
}

export interface AuditReviewResult {
  items: AuditReviewItem[];
  nextCursor: string | null;
  summary: { high: number; medium: number; low: number; total: number };
}

// ---- Stage 10: production go-live readiness ----
export type GoLiveCheckStatus = 'ok' | 'warning' | 'blocked' | 'unknown';
export type GoLiveStatus = 'ready' | 'warning' | 'blocked';

export interface GoLiveCheck {
  key: string;
  label: string;
  status: GoLiveCheckStatus;
  detail: string;
}

export interface GoLiveSection {
  key: string;
  title: string;
  status: GoLiveStatus;
  checks: GoLiveCheck[];
}

export interface GoLiveChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface GoLiveReadinessReport {
  status: GoLiveStatus;
  environment: string;
  appEnv: string | null;
  isProduction: boolean;
  targetingProduction: boolean;
  sections: GoLiveSection[];
  checklist: GoLiveChecklistItem[];
  warnings: string[];
  timestamp: string;
}

// ---- Compliance / Enhanced KYC (Stage 5.0) ----
export type ComplianceKycStatus =
  | 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'NEEDS_MORE_INFO'
  | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type ComplianceRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'PROHIBITED';
export type LivenessStatus = 'NOT_STARTED' | 'PENDING' | 'PASSED' | 'FAILED' | 'REVIEW_REQUIRED';
export type ScreeningStatus = 'NOT_SCREENED' | 'PENDING' | 'CLEAR' | 'HIT' | 'REVIEW_REQUIRED';

// ---- screening: sanctions / PEP / adverse-media (Stage 5.1) ----
export type ScreeningCheckStatus = 'PENDING' | 'CLEAR' | 'POSSIBLE_MATCH' | 'FAILED' | 'ERROR';
export type ScreeningOverall = ScreeningCheckStatus | 'NOT_SCREENED';
export type ScreeningCategory = 'SANCTIONS' | 'PEP' | 'ADVERSE_MEDIA';
export type ScreeningDecision = 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW' | 'FALSE_POSITIVE';

export interface ScreeningMatchItem {
  id: string;
  category: ScreeningCategory;
  name: string;
  matchScore: number;
  listName: string | null;
  sourceUrl: string | null;
  details: unknown;
  createdAt: string;
}

export interface ScreeningCheckItem {
  id: string;
  batchId: string;
  category: ScreeningCategory;
  status: ScreeningCheckStatus;
  provider: string;
  providerMode: 'mock' | 'live';
  providerReference: string | null;
  score: number;
  summary: string | null;
  decision: ScreeningDecision | null;
  decisionNote: string | null;
  decidedByAdminId: string | null;
  decidedAt: string | null;
  blocking: boolean;
  matches: ScreeningMatchItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminScreeningView {
  overall: ScreeningOverall;
  blocked: boolean;
  blockingCategories: ScreeningCategory[];
  byCategory: {
    SANCTIONS: ScreeningCheckItem | null;
    PEP: ScreeningCheckItem | null;
    ADVERSE_MEDIA: ScreeningCheckItem | null;
  };
  checks: ScreeningCheckItem[];
  providerMode?: 'mock' | 'live';
}

export interface UserCompliance {
  status: ComplianceKycStatus;
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  fullName: string | null;
  countryOfResidence: string | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
  riskLevel: ComplianceRiskLevel;
  livenessStatus: LivenessStatus;
  sanctionsStatus: ScreeningStatus;
  pepStatus: ScreeningStatus;
  adverseMediaStatus: ScreeningStatus;
  screeningStatus: ScreeningOverall;
  geoCaptureStatus: string;
  submittedAt: string | null;
  lastReviewedAt: string | null;
  nextReviewDueAt: string | null;
  rejectionReason: string | null;
  providerMode: 'mock' | 'live';
}

export interface LivenessSessionResp {
  provider: string;
  mode: 'mock' | 'live';
  providerReference: string;
  sessionId: string;
  status: string;
  captureUrl: string;
  expiresInSec: number;
}

export interface LivenessVerifyResp {
  provider: string;
  mode: 'mock' | 'live';
  status: 'PASSED' | 'FAILED' | 'REVIEW_REQUIRED';
  confidence: number;
}

export interface SubmitEnhancedKycInput {
  customerType?: 'INDIVIDUAL' | 'BUSINESS';
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  pan: string;
  aadhaar?: string;
  consents: {
    kycProcessing: true;
    amlScreening: true;
    dataRetention: true;
    termsAccepted: true;
    riskDisclosure: true;
  };
}

export interface ComplianceQueueItem {
  userId: string;
  email: string;
  status: ComplianceKycStatus;
  riskLevel: ComplianceRiskLevel;
  riskScore: number;
  livenessStatus: LivenessStatus;
  sanctionsStatus: ScreeningStatus;
  screeningStatus: ScreeningOverall;
  countryOfResidence: string | null;
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  submittedAt: string;
  lastReviewedAt: string | null;
  nextReviewDueAt: string | null;
}

export interface ComplianceEvidenceItem {
  id: string;
  type: string;
  status: string;
  provider: string | null;
  referenceId: string | null;
  storageKey: string | null;
  documentId: string | null;
  metadata: unknown;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
}

export interface ComplianceConsentItem {
  id: string;
  consentType: string;
  version: string;
  ip: string | null;
  userAgent: string | null;
  acceptedAt: string;
}

export interface RiskAssessmentItem {
  id: string;
  score: number;
  level: ComplianceRiskLevel;
  reasons: Array<{ code: string; message: string; weight: number }>;
  source: string;
  createdAt: string;
  createdByAdminId: string | null;
}

export interface AdminComplianceProfile {
  userId: string;
  email: string;
  accountStatus: string;
  legacyKycStatus: string;
  kycTier: number;
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  status: ComplianceKycStatus;
  fullName: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  countryOfResidence: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  panMasked: string | null;
  panLast4: string | null;
  aadhaarMasked: string | null;
  aadhaarLast4: string | null;
  riskLevel: ComplianceRiskLevel;
  riskScore: number;
  riskReason: string | null;
  onboarding: {
    ip: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    latitude: string | null;
    longitude: string | null;
    userAgent: string | null;
    geoCaptureStatus: string;
  };
  livenessStatus: LivenessStatus;
  livenessProvider: string | null;
  livenessReference: string | null;
  livenessScore: number | null;
  sanctionsStatus: ScreeningStatus;
  pepStatus: ScreeningStatus;
  adverseMediaStatus: ScreeningStatus;
  kycProvider: string | null;
  kycProviderReference: string | null;
  consentVersion: string | null;
  complianceNote: string | null;
  verifiedAt: string | null;
  lastReviewedAt: string | null;
  nextReviewDueAt: string | null;
  retentionUntil: string | null;
  reviewedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminComplianceDetail {
  profile: AdminComplianceProfile;
  evidence: ComplianceEvidenceItem[];
  consents: ComplianceConsentItem[];
  riskAssessments: RiskAssessmentItem[];
  providerMode: 'mock' | 'live';
}

// ---- Stage 5.2: suspicious-transaction monitoring + STR cases ----
export type ComplianceAlertType =
  | 'HIGH_VALUE_WITHDRAWAL'
  | 'RAPID_DEPOSIT_WITHDRAWAL'
  | 'STRUCTURING_PATTERN'
  | 'ABNORMAL_TRADING_VOLUME'
  | 'REPEATED_FAILED_WITHDRAWALS'
  | 'HIGH_RISK_USER_ACTIVITY'
  | 'SCREENING_RISK_ACTIVITY';
export type ComplianceAlertStatus = 'OPEN' | 'IN_REVIEW' | 'LINKED_TO_CASE' | 'DISMISSED' | 'RESOLVED';
export type ComplianceCaseStatus = 'OPEN' | 'IN_REVIEW' | 'ESCALATED' | 'STR_DRAFTED' | 'CLOSED';
export type ComplianceCasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ComplianceCaseType =
  | 'SUSPICIOUS_TRANSACTION'
  | 'HIGH_RISK_USER'
  | 'WALLET_RISK'
  | 'SCREENING_MATCH'
  | 'MANUAL_REVIEW';

export interface ComplianceAlertItem {
  id: string;
  userId: string;
  type: ComplianceAlertType;
  status: ComplianceAlertStatus;
  priority: ComplianceCasePriority;
  score: number;
  title: string;
  description: string | null;
  details: unknown;
  caseId: string | null;
  resolvedByAdminId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceCaseNoteItem {
  id: string;
  adminId: string | null;
  body: string;
  createdAt: string;
}

export interface ComplianceCaseEventItem {
  id: string;
  action: string;
  actorAdminId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ComplianceCaseListItem {
  id: string;
  userId: string;
  email: string;
  type: ComplianceCaseType;
  status: ComplianceCaseStatus;
  priority: ComplianceCasePriority;
  title: string;
  alertCount: number;
  assignedToAdminId: string | null;
  openedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceCaseDetail {
  id: string;
  userId: string;
  email: string;
  type: ComplianceCaseType;
  status: ComplianceCaseStatus;
  priority: ComplianceCasePriority;
  title: string;
  summary: string | null;
  dedupeKey: string | null;
  assignedToAdminId: string | null;
  openedByAdminId: string | null;
  closedByAdminId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  alerts: ComplianceAlertItem[];
  notes: ComplianceCaseNoteItem[];
  events: ComplianceCaseEventItem[];
}

export interface ComplianceCaseSummary {
  openCases: number;
  highCriticalCases: number;
  openAlerts: number;
  strDrafted: number;
}

export interface MonitoringRunResult {
  usersEvaluated: number;
  alertsCreated: number;
  alertsExisting: number;
  casesCreated: number;
  alertsLinked: number;
}

// ---- Stage 8D: user timeline ----
export interface TimelineEvent {
  id: string;
  category: string;
  type: string;
  title: string;
  detail: string | null;
  refType: string | null;
  refId: string | null;
  occurredAt: string;
}
export interface TimelinePage {
  items: TimelineEvent[];
  nextCursor: string | null;
  complianceVisible: boolean;
}

// ---- Stage 8C: support tickets ----
export interface SupportTicketListItem {
  id: string;
  userId: string | null;
  userEmail: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignedAdminId: string | null;
  createdByAdminId: string | null;
  closedByAdminId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface SupportTicketNote {
  id: string;
  authorAdminId: string | null;
  body: string;
  createdAt: string;
}
export interface SupportTicketDetail extends SupportTicketListItem {
  notes: SupportTicketNote[];
}
export interface SupportTicketPage {
  items: SupportTicketListItem[];
  nextCursor: string | null;
}

// ---- Stage 8B: admin notification center ----
export interface AdminOpsNotification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  targetType: string | null;
  targetId: string | null;
  isRead: boolean;
  readAt: string | null;
  readByAdminId: string | null;
  createdAt: string;
}

export interface AdminNotificationPage {
  items: AdminOpsNotification[];
  nextCursor: string | null;
  unread: number;
}

// ---- Stage 8A: admin command center ----
export interface CommandCenterCards {
  totalUsers: number;
  newUsersToday: number;
  pendingKyc: number;
  enhancedKycRequired: number;
  openCases: number;
  openAlerts: number;
  pendingInrDeposits: number;
  pendingInrWithdrawals: number;
  pendingCryptoWithdrawals: number;
  failedPaymentEvents: number;
  activeSessions: number;
  adminActionsToday: number;
  systemHealth: 'ok' | 'degraded' | 'unavailable';
}

export interface CommandCenter {
  cards: CommandCenterCards;
  operationsQueue: {
    pendingInrDeposits: Array<{ id: string; userId: string; email: string; amount: string; status: string; createdAt: string }>;
    pendingInrWithdrawals: Array<{ id: string; userId: string; email: string; amount: string; status: string; createdAt: string }>;
    cryptoWithdrawalsForReview: Array<{ id: string; userId: string; email: string; asset: string; chain: string; amount: string; status: string; requestedAt: string }>;
    pendingKycReviews: Array<{ userId: string; email: string; kycStatus: string; riskLevel: string; createdAt: string }>;
    usersUnderComplianceReview: Array<{ userId: string; email: string }>;
  };
  riskQueue: {
    highRiskUsers: Array<{ userId: string; email: string; riskLevel: string; riskNote: string | null }>;
    walletRiskAlerts: Array<{ id: string; chain: string; address: string; level: string; status: string; score: number; checkedAt: string }>;
    complianceAlerts: Array<{ id: string; userId: string; email: string; type: string; priority: string; score: number; title: string; createdAt: string }>;
    openCases: Array<{ id: string; userId: string; email: string; type: string; priority: string; status: string; title: string; createdAt: string }>;
  };
  recentActivity: {
    signups: Array<{ userId: string; email: string; kycStatus: string; createdAt: string }>;
    adminActions: Array<{ id: string; adminId: string; adminEmail: string | null; action: string; targetType: string | null; targetId: string | null; occurredAt: string }>;
    inrTransactions: Array<{ id: string; userId: string; email: string; type: string; amount: string; status: string; createdAt: string }>;
    securityEvents: Array<{ id: string; action: string; ip: string | null; occurredAt: string }>;
    highRiskEvents: Array<{ id: string; userId: string; email: string; type: string; priority: string; title: string; createdAt: string }>;
  };
  systemHealth: {
    available: boolean;
    status: 'ok' | 'degraded' | 'unavailable';
    version: string | null;
    uptimeSec: number | null;
    dependencies: Array<{ name: string; status: string }>;
  };
  meta: { generatedAt: string; note: string };
}

// ---- Stage 4A: compliance dashboard aggregate ----
export interface ComplianceDashboardCards {
  pendingKycReviews: number;
  enhancedKycRequired: number;
  highRiskUsers: number;
  openCases: number;
  highCriticalCases: number;
  openAlerts: number;
  pendingWithdrawalReviews: number;
  screeningFlaggedUsers: number;
  walletRiskAlerts: number;
  openStrDrafts: number;
}

export interface DashKycItem {
  userId: string;
  email: string;
  status: string;
  riskLevel: string;
  riskScore: number;
  submittedAt: string;
}
export interface DashRiskItem {
  userId: string;
  email: string;
  riskLevel: string;
  riskScore: number;
  riskReason: string | null;
  lastReviewedAt: string | null;
  updatedAt: string;
}
export interface DashWithdrawalItem {
  id: string;
  userId: string;
  email: string;
  asset: string;
  chain: string;
  amount: string;
  status: string;
  requestedAt: string;
}
export interface DashCaseItem {
  id: string;
  userId: string;
  email: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  assignedToAdminId: string | null;
  createdAt: string;
}
export interface DashStrDraftItem {
  id: string;
  reportType: string;
  status: string;
  scopeType: string;
  scopeUserId: string | null;
  scopeCaseId: string | null;
  title: string;
  createdAt: string;
}
export interface DashAlertItem {
  id: string;
  userId: string;
  email: string;
  type: string;
  status: string;
  priority: string;
  score: number;
  title: string;
  createdAt: string;
}
export interface DashWalletRiskItem {
  id: string;
  userId: string | null;
  asset: string;
  chain: string;
  address: string;
  level: string;
  status: string;
  score: number;
  checkedAt: string;
}

export interface ComplianceDashboard {
  cards: ComplianceDashboardCards;
  queues: {
    kycReview: DashKycItem[];
    riskReview: DashRiskItem[];
    withdrawalReview: DashWithdrawalItem[];
    openCases: DashCaseItem[];
    strDrafts: DashStrDraftItem[];
    recentAlerts: DashAlertItem[];
    walletRisk: DashWalletRiskItem[];
  };
  meta: {
    generatedAt: string;
    note: string;
    appliedFilters: Record<string, string>;
  };
}

export interface ComplianceDashboardFilters {
  riskLevel?: string;
  caseStatus?: string;
  alertType?: string;
  assignedAdminId?: string;
  from?: string;
  to?: string;
  previewLimit?: number;
}

// ---- Stage 5.3: wallet risk + Travel Rule ----
export type WalletRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type WalletRiskStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'FAILED';
export type TravelRuleStatus =
  | 'NOT_REQUIRED'
  | 'REQUIRED'
  | 'PENDING_INFO'
  | 'READY'
  | 'SENT_MOCK'
  | 'FAILED'
  | 'EXEMPTED';
export type TravelRuleDirection = 'INBOUND' | 'OUTBOUND';

export interface WalletRiskCheckItem {
  id: string;
  profileId: string | null;
  userId: string | null;
  chain: string;
  address: string;
  direction: TravelRuleDirection | null;
  level: WalletRiskLevel;
  status: WalletRiskStatus;
  provider: string;
  providerMode: string;
  score: number;
  summary: string | null;
  categories: unknown;
  alertId: string | null;
  caseId: string | null;
  reviewDecision: WalletRiskStatus | null;
  reviewNote: string | null;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface WalletRiskProfileItem {
  id: string;
  chain: string;
  address: string;
  level: WalletRiskLevel;
  status: WalletRiskStatus;
  score: number;
  checkCount: number;
  categories: unknown;
  overriddenLevel: WalletRiskLevel | null;
  notes: string | null;
  lastScreenedAt: string | null;
  createdAt: string;
}

export interface WalletRiskEventItem {
  id: string;
  action: string;
  actorAdminId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface WalletRiskProfileDetail extends WalletRiskProfileItem {
  checks: WalletRiskCheckItem[];
  events: WalletRiskEventItem[];
}

export interface WalletRiskSummary {
  highRiskProfiles: number;
  blockedProfiles: number;
  reviewRequiredChecks: number;
  pendingTravelRule: number;
}

export interface TravelRuleTransferItem {
  id: string;
  direction: TravelRuleDirection;
  status: TravelRuleStatus;
  userId: string | null;
  chain: string;
  asset: string;
  amount: string;
  thresholdAmount: string | null;
  counterpartyAddress: string | null;
  counterpartyId: string | null;
  originatorName: string | null;
  beneficiaryName: string | null;
  infoCollectedAt: string | null;
  sentMockAt: string | null;
  exemptedReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  counterparty?: { id: string; name: string } | null;
}

export type TravelRuleAction = 'COLLECTED' | 'EXEMPTED' | 'SENT_MOCK' | 'REQUEST_INFO';

// ---- Stage 5.4: evidence packs + record retention ----
export type EvidencePackType = 'USER_KYC' | 'STR_CASE' | 'WALLET_RISK' | 'TRAVEL_RULE' | 'FULL_USER_COMPLIANCE';
export type EvidencePackStatus = 'QUEUED' | 'BUILDING' | 'READY' | 'FAILED' | 'EXPIRED';
export type EvidencePackFormat = 'JSON' | 'PDF_PLACEHOLDER';
export type RetentionPolicyStatus = 'ACTIVE' | 'DISABLED';
export type RetentionReviewStatus = 'PENDING' | 'REVIEWED' | 'ESCALATED';
export type ComplianceExportType = 'EVIDENCE_PACK' | 'USER_COMPLIANCE_EXPORT' | 'CASE_EXPORT' | 'RETENTION_REVIEW_EXPORT';

export interface EvidencePackListItem {
  id: string;
  packType: EvidencePackType;
  status: EvidencePackStatus;
  format: EvidencePackFormat;
  title: string;
  summary: string | null;
  label: string;
  scopeUserId: string | null;
  scopeCaseId: string | null;
  scopeRef: string | null;
  itemCount: number;
  checksum: string | null;
  createdAt: string;
}

export interface EvidencePackItem {
  id: string;
  itemType: string;
  refId: string | null;
  title: string;
  data: unknown;
  createdAt: string;
}

export interface EvidencePackDetail {
  id: string;
  packType: EvidencePackType;
  status: EvidencePackStatus;
  format: EvidencePackFormat;
  label: string;
  title: string;
  summary: string | null;
  scope: { userId: string | null; caseId: string | null; ref: string | null };
  itemCount: number;
  checksum: string | null;
  error: string | null;
  generatedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  payload: unknown;
  items: EvidencePackItem[];
}

export interface RetentionPolicy {
  id: string;
  recordType: string;
  retentionYears: number;
  status: RetentionPolicyStatus;
  description: string | null;
  createdByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RetentionReview {
  id: string;
  policyId: string | null;
  recordType: string;
  status: RetentionReviewStatus;
  periodStart: string | null;
  periodEnd: string | null;
  eligibleCount: number;
  retainedCount: number;
  nearingBoundaryCount: number;
  notes: string | null;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceExportEventItem {
  id: string;
  exportType: ComplianceExportType;
  packId: string | null;
  scopeUserId: string | null;
  scopeRef: string | null;
  format: string | null;
  checksum: string | null;
  label: string;
  adminId: string | null;
  createdAt: string;
}

// ---- Stage 5.5: tax / TDS + legal ----
export type TaxEventType = 'TRADE_SELL' | 'WITHDRAWAL' | 'CONVERSION' | 'FEE' | 'OTHER';
export type TaxRuleStatus = 'ACTIVE' | 'DISABLED';
export type TdsRecordStatus = 'CALCULATED' | 'WAIVED' | 'REVERSED' | 'FAILED';
export type TaxStatementStatus = 'DRAFT' | 'GENERATED' | 'EXPIRED';
export type LegalDocumentType =
  | 'TERMS_OF_SERVICE'
  | 'PRIVACY_POLICY'
  | 'RISK_DISCLOSURE'
  | 'AML_POLICY_NOTICE'
  | 'FEE_POLICY'
  | 'TAX_DISCLOSURE';
export type LegalAcceptanceStatus = 'ACCEPTED' | 'REVOKED' | 'SUPERSEDED';

export interface TaxRule {
  id: string;
  eventType: TaxEventType;
  name: string;
  rateBps: number;
  thresholdAmount: string | null;
  status: TaxRuleStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserTaxProfile {
  id?: string;
  userId: string;
  panAvailable: boolean;
  panStatus: string | null;
  residentStatus: string | null;
  taxJurisdiction: string;
  higherTdsApplicable: boolean;
  notes?: string | null;
}

export interface TdsRecordItem {
  id: string;
  userId: string;
  eventType: TaxEventType;
  sourceType: string | null;
  sourceRef: string | null;
  grossAmount: string;
  asset: string | null;
  rateBps: number;
  tdsAmount: string;
  status: TdsRecordStatus;
  label: string;
  financialYear: string | null;
  createdAt: string;
}

export interface TaxSummary {
  label: string;
  financialYear: string;
  recordCount: number;
  totalGross: number;
  totalTds: number;
  byEvent: Record<string, { count: number; gross: number; tds: number }>;
}

export interface TaxStatementItem {
  id: string;
  userId: string;
  financialYear: string;
  status: TaxStatementStatus;
  label: string;
  totalGross: string;
  totalTds: string;
  recordCount: number;
  checksum: string | null;
  createdAt: string;
}

export interface LegalDocument {
  id: string;
  type: LegalDocumentType;
  version: string;
  title: string;
  content: string;
  checksum: string;
  isCurrent: boolean;
  effectiveAt: string;
  createdAt: string;
}

export interface LegalAcceptanceItem {
  id: string;
  userId: string;
  documentType: LegalDocumentType;
  version: string;
  checksum: string | null;
  status: LegalAcceptanceStatus;
  ip: string | null;
  acceptedAt: string;
}

// ---- Stage 5.6: FIU draft reporting ----
export type FiuReportType = 'STR' | 'CTR' | 'NTR' | 'CBWTR' | 'INTERNAL_SUSPICIOUS_ACTIVITY_SUMMARY';
export type FiuDraftStatus = 'DRAFT' | 'VALIDATING' | 'READY_FOR_INTERNAL_REVIEW' | 'EXPORTED_DRAFT' | 'FAILED' | 'ARCHIVED';
export type FiuReportScopeType = 'USER' | 'CASE' | 'DATE_RANGE' | 'TRANSACTION_SET';
export type FiuValidationSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface FiuReportListItem {
  id: string;
  reportType: FiuReportType;
  status: FiuDraftStatus;
  scopeType: FiuReportScopeType;
  format: string;
  label: string;
  submissionState: string;
  title: string;
  scopeUserId: string | null;
  scopeCaseId: string | null;
  evidencePackId: string | null;
  checksum: string | null;
  errorCount: number;
  warningCount: number;
  createdAt: string;
}

export interface FiuReportIssue {
  id: string;
  severity: FiuValidationSeverity;
  code: string;
  field: string | null;
  message: string;
  createdAt: string;
}

export interface FiuReportItem {
  id: string;
  itemType: string;
  refId: string | null;
  title: string;
  data: unknown;
  createdAt: string;
}

export interface FiuReportDetail {
  id: string;
  reportType: FiuReportType;
  status: FiuDraftStatus;
  scopeType: FiuReportScopeType;
  format: string;
  label: string;
  submissionState: string;
  title: string;
  narrative: string | null;
  scope: { userId: string | null; caseId: string | null; evidencePackId: string | null };
  sourceRefs: unknown;
  checksum: string | null;
  errorCount: number;
  warningCount: number;
  createdAt: string;
  updatedAt: string;
  payload: unknown;
  items: FiuReportItem[];
  issues: FiuReportIssue[];
}

export interface FiuExportEventItem {
  id: string;
  reportId: string;
  reportType: FiuReportType;
  format: string | null;
  checksum: string | null;
  label: string;
  submissionState: string;
  adminId: string | null;
  createdAt: string;
}

// ---- Stage 5.7: AML policy + compliance workspace ----
export type AmlPolicyStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
export type AmlRuleType = 'TRANSACTION_MONITORING' | 'WALLET_RISK' | 'USER_RISK' | 'KYC' | 'FIU_DRAFT' | 'TAX_LEGAL' | 'MANUAL';
export type AmlRuleSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AmlRuleAction = 'FLAG_ONLY' | 'CREATE_ALERT' | 'CREATE_CASE' | 'REQUIRE_REVIEW' | 'ESCALATE';
export type ComplianceTaskType = 'KYC_REVIEW' | 'SCREENING_REVIEW' | 'STR_CASE_REVIEW' | 'WALLET_RISK_REVIEW' | 'TRAVEL_RULE_REVIEW' | 'FIU_DRAFT_REVIEW' | 'TAX_LEGAL_REVIEW' | 'GENERAL_AML_REVIEW';
export type ComplianceTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_INFO' | 'ESCALATED' | 'COMPLETED' | 'CANCELLED';
export type ComplianceTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ComplianceApprovalType = 'FIU_DRAFT_EXPORT' | 'CASE_STATUS_CHANGE' | 'RISK_OVERRIDE' | 'SCREENING_OVERRIDE' | 'WALLET_RISK_OVERRIDE' | 'LEGAL_POLICY_PUBLISH';
export type ComplianceApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'COMPLETED';

export interface AmlPolicyListItem {
  id: string;
  version: string;
  name: string;
  status: AmlPolicyStatus;
  description: string | null;
  activatedAt: string | null;
  createdAt: string;
  _count?: { rules: number };
}

export interface AmlRule {
  id: string;
  policyId: string;
  ruleType: AmlRuleType;
  name: string;
  severity: AmlRuleSeverity;
  action: AmlRuleAction;
  conditionKey: string | null;
  operator: string | null;
  thresholdValue: string | null;
  enabled: boolean;
  description: string | null;
}

export interface AmlPolicyDetail extends AmlPolicyListItem {
  rules: AmlRule[];
}

export interface AmlEvaluationResult {
  policyId: string;
  policyVersion: string;
  reviewOnly: true;
  context: unknown;
  matchedCount: number;
  highestSeverity: AmlRuleSeverity | null;
  recommendedActions: AmlRuleAction[];
  recommendations: Array<{ ruleId: string; ruleType: AmlRuleType; name: string; severity: AmlRuleSeverity; action: AmlRuleAction; matchedValue: unknown }>;
}

export interface WorkspaceSummary {
  openTasks: number;
  assignedToMe: number;
  breachedSla: number;
  highCritical: number;
  pendingApprovals: number;
  fiuNeedingReview: number;
}

export interface ComplianceTaskListItem {
  id: string;
  type: ComplianceTaskType;
  status: ComplianceTaskStatus;
  priority: ComplianceTaskPriority;
  title: string;
  assignedToAdminId: string | null;
  scopeUserId: string | null;
  email: string | null;
  slaStatus: SlaStatus | null;
  dueAt: string | null;
  createdAt: string;
}

export interface ComplianceTaskEventItem {
  id: string;
  action: string;
  actorAdminId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ComplianceTaskDetail {
  id: string;
  type: ComplianceTaskType;
  status: ComplianceTaskStatus;
  priority: ComplianceTaskPriority;
  title: string;
  description: string | null;
  assignedToAdminId: string | null;
  scopeUserId: string | null;
  caseId: string | null;
  alertId: string | null;
  walletRiskCheckId: string | null;
  fiuReportId: string | null;
  evidencePackId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  liveSlaStatus: SlaStatus | null;
  events: ComplianceTaskEventItem[];
  checklistResponses: Array<{ id: string; templateId: string | null; answers: unknown; completed: boolean; createdAt: string }>;
  sla: { slaMinutes: number; dueAt: string; status: SlaStatus } | null;
  user: { email: string } | null;
}

export interface AmlChecklistTemplate {
  id: string;
  taskType: ComplianceTaskType;
  name: string;
  version: string;
  items: Array<{ key: string; label: string; required?: boolean }>;
  requiredForCompletion: boolean;
  active: boolean;
  createdAt: string;
}

export interface ComplianceApprovalItem {
  id: string;
  approvalType: ComplianceApprovalType;
  status: ComplianceApprovalStatus;
  title: string;
  reason: string | null;
  targetType: string | null;
  targetId: string | null;
  taskId: string | null;
  makerAdminId: string;
  checkerAdminId: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}
