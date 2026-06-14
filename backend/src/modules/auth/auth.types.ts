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
}

export interface SessionDto {
  id: string;
  ip: string | null;
  device: unknown;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

/** Request-scoped context threaded into the service for audit/forensics. */
export interface AuthContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface RegisterInput {
  email: string;
  phone?: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}
