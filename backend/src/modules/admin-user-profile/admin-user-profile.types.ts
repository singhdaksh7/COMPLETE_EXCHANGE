/**
 * Typed DTOs for the admin "full user profile" aggregate (Stage 5).
 *
 * This is the support/compliance/admin single-pane view of a user. It is built
 * ENTIRELY from real DB rows — there is no synthetic/mock data anywhere. When a
 * section has no rows the API returns an empty page (`items: []`) and the UI
 * renders an empty state. Sensitive identifiers are only ever surfaced in the
 * already-masked form the rest of the admin surface uses (PAN/Aadhaar masked,
 * never raw secrets/tokens).
 */

/** A cursor-paginated slice of one profile section. */
export interface ProfilePage<T> {
  items: T[];
  nextCursor: string | null;
}

/** The list-style sections that support cursor pagination. */
export const PROFILE_SECTIONS = [
  'inrDeposits',
  'inrWithdrawals',
  'cryptoDeposits',
  'cryptoWithdrawals',
  'orders',
  'trades',
  'sessions',
  'auditTrail',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export interface IdentityDto {
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

export interface KycDto {
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

export interface BalanceDto {
  asset: string;
  available: string;
  locked: string;
  total: string;
}

export interface InrTxnDto {
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

export interface CryptoDepositDto {
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

export interface CryptoWithdrawalDto {
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

export interface OrderDto {
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

export interface TradeDto {
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

export interface SessionDto {
  id: string;
  ip: string | null;
  deviceInfo: unknown;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
}

/** A single row of the admin-action audit trail for this user. */
export interface AuditTrailDto {
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

/** Risk + compliance posture (only included when caller has compliance.view). */
export interface RiskComplianceDto {
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
  flags: RiskFlagDto[];
  openCases: RiskCaseLinkDto[];
}

export interface RiskFlagDto {
  kind: 'SCREENING' | 'WALLET_RISK' | 'ALERT';
  label: string;
  status: string;
  level: string | null;
  detail: string | null;
  createdAt: string;
}

export interface RiskCaseLinkDto {
  id: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  createdAt: string;
}

export interface ComplianceNoteDto {
  id: string;
  adminId: string | null;
  body: string;
  createdAt: string;
}

/** The full aggregate returned by GET /users/:userId/profile. */
export interface UserProfileDto {
  identity: IdentityDto;
  kyc: KycDto;
  balances: BalanceDto[];
  inrDeposits: ProfilePage<InrTxnDto>;
  inrWithdrawals: ProfilePage<InrTxnDto>;
  cryptoDeposits: ProfilePage<CryptoDepositDto>;
  cryptoWithdrawals: ProfilePage<CryptoWithdrawalDto>;
  orders: ProfilePage<OrderDto>;
  trades: ProfilePage<TradeDto>;
  sessions: ProfilePage<SessionDto>;
  auditTrail: ProfilePage<AuditTrailDto>;
  riskCompliance: RiskComplianceDto;
  complianceNotes: ProfilePage<ComplianceNoteDto> | null;
  meta: {
    complianceVisible: boolean;
    canRevokeSessions: boolean;
    canManageNotes: boolean;
  };
}
