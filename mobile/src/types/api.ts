/**
 * Response/request shapes mirrored from the EXORA backend user DTOs. These are a
 * USER-ONLY subset — no admin/compliance officer types are included in the
 * mobile app. Kept in sync with the web client's lib/types.ts.
 */

export interface Envelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

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

/**
 * Stage 9A — explicit acceptance of the required legal policies, captured at
 * signup. Every flag is a literal `true`: the backend rejects registration
 * (422) unless all three were ticked. The policy VERSIONS accepted are resolved
 * and recorded server-side, never sent from the client, so consent can't be
 * faked or back-dated here.
 */
export interface AcceptedPolicies {
  termsOfService: true;
  privacyPolicy: true;
  riskDisclosure: true;
}

export interface RegisterData {
  user: PublicUser;
  emailVerificationRequired: boolean;
}

export interface LoginData {
  user: PublicUser;
  tokens: TokenPair;
}

// ---- 2FA / MFA (TOTP) + step-up (Stage 3) ----
export interface TwoFactorChallengeData {
  twoFactorRequired: true;
  challengeToken: string;
  methods: ('totp' | 'backup_code')[];
}

export type LoginResult = LoginData | TwoFactorChallengeData;

/** Narrow a login result to the 2FA-challenge branch. */
export function isTwoFactorChallenge(v: LoginResult): v is TwoFactorChallengeData {
  return (v as TwoFactorChallengeData).twoFactorRequired === true;
}

// ------------------------------------------------------------------
// Federated identity (Google/Apple via Firebase Authentication, Stage 12)
// ------------------------------------------------------------------

export type FederatedProvider = 'GOOGLE' | 'APPLE';

/** Mirrors the backend's central federated-auth response contract exactly. */
export type FederatedLoginOutcome =
  | { status: 'AUTHENTICATED'; result: LoginResult }
  | { status: 'ACCOUNT_LINK_REQUIRED'; challengeToken: string; maskedEmail: string }
  | { status: 'FEDERATED_REGISTRATION_REQUIRED'; challengeToken: string; email: string };

export interface TwoFaStatusData {
  enabled: boolean;
  backupCodesRemaining: number;
}

export interface TwoFaSetupData {
  secret: string;
  otpauthUri: string;
}

export interface TwoFaConfirmData {
  enabled: true;
  backupCodes: string[];
}

export interface StepUpData {
  stepUpToken: string;
  expiresInSeconds: number;
}

/**
 * Effective per-user feature access from /auth/me (already AND-ed with the
 * global compliance flags on the backend). The app MUST gate UI on THIS map —
 * never on assumptions — so crypto funding stays hidden in INR-only mode.
 */
export interface UserFeatureMap {
  inrDeposit: boolean;
  inrWithdrawal: boolean;
  trading: boolean;
  cryptoWallet: boolean;
  cryptoDeposit: boolean;
  cryptoWithdrawal: boolean;
}

export interface GlobalFeatureStatus {
  cryptoDepositsGlobalEnabled: boolean;
  cryptoWithdrawalsGlobalEnabled: boolean;
  cryptoWalletGlobalEnabled: boolean;
  inrDepositsGlobalEnabled: boolean;
  inrWithdrawalsGlobalEnabled: boolean;
  tradingGlobalEnabled: boolean;
  mode: 'INR_ONLY' | 'FULL';
}

export interface MeData {
  user: PublicUser;
  roles: string[];
  permissions: string[];
  /** Stage 15 effective feature map. Optional for older backends. */
  features?: UserFeatureMap;
  globalFeatureStatus?: GlobalFeatureStatus;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ---- wallet / portfolio ----
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

export interface WithdrawalAddress {
  id: string;
  chain: string;
  address: string;
  label: string | null;
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
  failureReason: string | null;
  requestedAt: string;
  broadcastAt: string | null;
  completedAt: string | null;
}

// ---- INR ----
export interface InrDeposit {
  id: string;
  type: string;
  amount: string;
  fee: string;
  status: string;
  provider: string | null;
  utr: string | null;
  method: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ManualDepositMethod = 'UPI' | 'IMPS' | 'NEFT' | 'QR' | 'BANK';

export interface CreateManualDepositInput {
  amount: string;
  utr: string;
  method: ManualDepositMethod;
  proofKey?: string;
}

/**
 * Manual INR deposit transfer instructions (Stage 10A). Backend source of
 * truth — never hardcode bank/UPI details client-side. `enabled` reflects
 * effective (global AND per-user) canDepositInr access.
 */
export type InrDepositInstructions =
  | {
      enabled: true;
      method: 'BANK_TRANSFER';
      bankName: string;
      beneficiaryName: string;
      accountNumber: string;
      ifsc: string;
      accountType: string;
      upiId: string;
      referenceRequired: true;
      instructions: string;
    }
  | {
      enabled: false;
      // FEATURE_DISABLED = INR deposits off for this user. UNAVAILABLE = on,
      // but the transfer destination isn't operator-confirmed yet (Stage
      // 10B) — both render the same honest "unavailable" UI; never surfaced
      // to the user as "unverified".
      reason: 'FEATURE_DISABLED' | 'UNAVAILABLE';
    };

// ---- INR withdrawal (manual payout) ----
export type InrPayoutMethod = 'UPI' | 'BANK';

/** Payout destination as returned to the owning user (already masked). */
export interface InrPayoutMasked {
  method: string;
  upiId: string | null;
  accountLast4: string | null;
  ifsc: string | null;
  holderName: string | null;
  bankName: string | null;
}

export interface InrWithdrawal {
  id: string;
  userId: string;
  amount: string;
  status: string;
  payout: InrPayoutMasked;
  utr: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
}

export interface CreateInrWithdrawalInput {
  amount: string;
  method: InrPayoutMethod;
  upiId?: string;
  accountNumber?: string;
  ifsc?: string;
  holderName?: string;
  bankName?: string;
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
  executedAt: string;
}

export interface PublicTrade {
  id: string;
  price: string;
  quantity: string;
  side: OrderSide;
  executedAt: string;
}

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

// ---- KYC / compliance ----
export interface KycProfile {
  status: string;
  tier: number;
  fullName: string | null;
  rejectedReason: string | null;
  reviewedAt: string | null;
  provider?: string | null;
  livenessStatus?: string | null;
  documentStatus?: string | null;
  riskScore?: number | null;
  panMasked?: string | null;
  aadhaarMasked?: string | null;
}

/** Real backend KYC status transitions (kyc.status.ts KYC_TRANSITIONS) — never guess a value not in this list. */
export type KycStatusValue =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_REVIEW'
  | 'MANUAL_REVIEW'
  | 'NEEDS_MORE_INFO'
  | 'APPROVED'
  | 'REJECTED';

/** Mirrors backend kycSubmitSchema exactly (kyc.validators.ts). */
export interface SubmitKycInput {
  fullName: string;
  dob: string; // YYYY-MM-DD
  pan: string;
  aadhaarRef?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

/** Mirrors backend KycSessionDto (kyc.types.ts) — vendor-neutral, mock in staging. */
export interface KycSessionDto {
  provider: string;
  providerSessionId: string;
  redirectUrl: string;
  expiresIn: number;
}

/** The ONLY document types the backend accepts (kyc.validators.ts KycDocType). */
export type KycDocType = 'PAN' | 'AADHAAR' | 'PASSPORT' | 'SELFIE' | 'ADDRESS_PROOF';

/** The ONLY MIME types the backend accepts (kyc.validators.ts ALLOWED_KYC_MIME_TYPES). */
export type KycAllowedMimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

export type KycDocumentUploadStatus = 'REGISTERED' | 'UPLOADED' | 'FAILED';

export interface KycDocumentDto {
  id: string;
  docType: KycDocType;
  status: string;
  /** Whether bytes actually reached storage — distinct from `status` above. */
  uploadStatus: KycDocumentUploadStatus;
  createdAt: string;
}

/** Mirrors backend KycDocumentUploadDto — the presigned-upload handle. */
export interface KycDocumentUploadDto {
  documentId: string;
  uploadUrl: string;
  requiredMethod: 'PUT';
  /** Headers that MUST be sent on the PUT for the signature to validate. */
  requiredHeaders: Record<string, string>;
  expiresIn: number;
}

export interface SubmitKycDocumentInput {
  docType: KycDocType;
  sha256: string;
  contentType: KycAllowedMimeType;
  fileSize?: number;
}

export interface UserCompliance {
  status: string;
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  fullName: string | null;
  countryOfResidence: string | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
  riskLevel: string;
  livenessStatus: string;
  sanctionsStatus: string;
  pepStatus: string;
  adverseMediaStatus: string;
  screeningStatus: string;
  geoCaptureStatus: string;
  submittedAt: string | null;
  lastReviewedAt: string | null;
  nextReviewDueAt: string | null;
  rejectionReason: string | null;
  providerMode: 'mock' | 'live';
}

// ---- notifications ----
export interface Notification {
  id: string;
  type: string;
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

// ---- account security ----
export interface UserSession {
  id: string;
  ip: string | null;
  device: unknown;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

// ---- legal / policy consent (Stage 9A) ----
export type LegalDocumentType =
  | 'TERMS_OF_SERVICE'
  | 'PRIVACY_POLICY'
  | 'RISK_DISCLOSURE'
  | 'AML_POLICY_NOTICE'
  | 'FEE_POLICY'
  | 'TAX_DISCLOSURE';

export type LegalAcceptanceStatus = 'ACCEPTED' | 'REVOKED' | 'SUPERSEDED';

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

/** Outstanding-policy status from /legal/consent-status (post-login banner + gate). */
export interface ConsentStatus {
  required: LegalDocumentType[];
  missing: LegalDocumentType[];
  upToDate: boolean;
  enforced: boolean;
}

// ---- support tickets (Stage 9A, user-facing own-tickets-only) ----
export type SupportTicketCategory =
  | 'ACCOUNT'
  | 'KYC'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRADING'
  | 'SECURITY'
  | 'OTHER';

export type SupportTicketStatus =
  | 'OPEN'
  | 'WAITING_FOR_ADMIN'
  | 'WAITING_FOR_USER'
  | 'RESOLVED'
  | 'CLOSED';

/** senderType is USER | ADMIN | SYSTEM. Internal admin notes are never sent here. */
export interface SupportMessage {
  id: string;
  senderType: string;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface SupportTicketSummary {
  id: string;
  ticketNumber: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface SupportTicketThread extends SupportTicketSummary {
  userId: string | null;
  messages: SupportMessage[];
}

export interface SupportTicketSummaryPage {
  items: SupportTicketSummary[];
  nextCursor: string | null;
}
