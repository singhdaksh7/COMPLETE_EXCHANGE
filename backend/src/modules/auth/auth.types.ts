import type {
  GlobalFeatureStatus,
  UserFeatureMap,
} from '../feature-controls/feature-controls.types';

export interface PublicUser {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  kycStatus: string;
  kycTier: number;
  emailVerifiedAt: Date | null;
  totpEnabled: boolean;
  createdAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

/**
 * Returned by login when the account has 2FA enabled: NO session is issued yet.
 * The client must call POST /auth/2fa/verify with the challenge token and a
 * current TOTP / backup code to receive real tokens. The challenge token is
 * short-lived and single-purpose.
 */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  methods: Array<'totp' | 'backup_code'>;
}

export type LoginResult = AuthResult | TwoFactorChallenge;

export interface RegisterResult {
  user: PublicUser;
  /**
   * Whether email verification is required before the user can log in. The raw
   * verification token is delivered out-of-band (email), never in the response.
   */
  emailVerificationRequired: boolean;
}

export interface MeResult {
  user: PublicUser;
  roles: string[];
  permissions: string[];
  /**
   * True when ALLOW_UNVERIFIED_LOGIN is enabled (Stage 13 temporary bypass).
   * The UI uses this to show a non-blocking testing/demo notice. Not a secret.
   */
  emailVerificationBypass: boolean;
  /**
   * Effective per-user feature access (Stage 15) — already AND-ed with the
   * global compliance flags. The frontend uses THIS to hide modules; it must
   * not re-derive access from raw settings.
   */
  features: UserFeatureMap;
  /** Platform-wide compliance flag status + mode (INR_ONLY vs FULL). */
  globalFeatureStatus: GlobalFeatureStatus;
}

/**
 * Raw browser geolocation captured at login (Stage 7B). User-consented and
 * NOT fraud-proof — a security/audit signal only. Precise coordinates are
 * rounded before storage (see `sanitizeLocation`).
 */
export interface LoginLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/** Reduced-precision location as stored on a session / audit event. */
export interface StoredLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
  capturedAt: string;
}

export interface SessionDto {
  id: string;
  ip: string | null;
  device: unknown;
  /** Reduced-precision login location, when the user consented at login. */
  location: StoredLocation | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  current: boolean;
}

/** A single account/security event for the user activity feed. */
export interface ActivityEventDto {
  id: string;
  action: string;
  entityType: string | null;
  ip: string | null;
  metadata: unknown;
  occurredAt: Date;
}

/** Request-scoped context threaded into the service for audit/forensics. */
export interface AuthContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  /** Optional consented login location (2FA / OTP second-step carry it too). */
  location?: LoginLocation;
}

export interface RegisterInput {
  email: string;
  phone?: string;
  password: string;
  /**
   * Stage 9A — explicit signup consent flags. Present on every real signup (the
   * validator requires them); optional here so unit tests that construct a bare
   * input still type-check. When present, the required policy acceptances are
   * recorded server-side against the CURRENT document versions.
   */
  acceptedPolicies?: {
    termsOfService: true;
    privacyPolicy: true;
    riskDisclosure: true;
  };
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  /** Optional consented browser geolocation (Stage 7B). */
  location?: LoginLocation;
}

/** Generic, enumeration-safe response to an OTP request/resend. */
export interface OtpRequestResult {
  sent: true;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}

/** Result of a successful OTP verification (login or just-created signup). */
export interface OtpVerifyResult extends AuthResult {
  isNewUser: boolean;
}

// ------------------------------------------------------------------
// Federated identity (Google/Apple via Firebase Authentication, Stage 12)
// ------------------------------------------------------------------

export type FederatedProviderName = 'GOOGLE' | 'APPLE';

export interface FederatedLoginInput {
  idToken: string;
  provider: FederatedProviderName;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  location?: LoginLocation;
}

/**
 * Central federated-auth response contract (Phase 21). The frontend/mobile
 * clients discriminate on `status` — never on ad-hoc error strings. When
 * `status === 'AUTHENTICATED'`, `result` is the SAME `LoginResult` shape a
 * normal password login returns (so existing 2FA-challenge handling is
 * reused unchanged). LOCATION_REQUIRED is NOT part of this union — like
 * every other login path, it is a thrown AppError (`LOCATION_REQUIRED` code)
 * before any challenge/session is issued.
 */
export type FederatedLoginOutcome =
  | { status: 'AUTHENTICATED'; result: LoginResult }
  | { status: 'ACCOUNT_LINK_REQUIRED'; challengeToken: string; maskedEmail: string }
  | { status: 'FEDERATED_REGISTRATION_REQUIRED'; challengeToken: string; email: string };

export interface FederatedLinkConfirmInput {
  challengeToken: string;
  otp: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  location?: LoginLocation;
}

export interface FederatedRegisterCompleteInput {
  challengeToken: string;
  phone: string;
  acceptedPolicies: {
    termsOfService: true;
    privacyPolicy: true;
    riskDisclosure: true;
  };
  ip?: string;
  userAgent?: string;
  requestId?: string;
  location?: LoginLocation;
}
