import { env, isProd, isDev, isTest } from './env';

/**
 * Centralized, typed application configuration derived from validated env.
 * Import `config` everywhere instead of reading process.env directly.
 */
export const config = {
  env: env.NODE_ENV,
  isProd,
  isDev,
  isTest,

  http: {
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    corsOrigins: env.CORS_ORIGINS,
    bodyLimit: env.BODY_LIMIT,
  },

  admin: {
    port: env.ADMIN_PORT,
    apiPrefix: env.ADMIN_API_PREFIX,
  },

  log: {
    level: env.LOG_LEVEL,
    pretty: env.LOG_PRETTY,
  },

  db: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    authMax: env.AUTH_RATE_LIMIT_MAX,
  },

  loginLockout: {
    maxAttempts: env.LOGIN_LOCKOUT_MAX_ATTEMPTS,
    windowMs: env.LOGIN_LOCKOUT_WINDOW_MS,
  },

  auth: {
    emailVerificationTtlMs: env.EMAIL_VERIFICATION_TTL_MS,
    passwordResetTtlMs: env.PASSWORD_RESET_TTL_MS,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    rbacCacheTtlSec: env.RBAC_CACHE_TTL_SEC,
  },

  // Production-safety acknowledgements (Stage 4.2). All default false; staging
  // sets the ones it needs. See src/lib/prod-safety.ts. NEVER set in real prod.
  security: {
    allowMockProviders: env.ALLOW_MOCK_PROVIDERS,
    allowMockWithdrawalSigner: env.ALLOW_MOCK_WITHDRAWAL_SIGNER,
    allowLogMailProvider: env.ALLOW_LOG_MAIL_PROVIDER,
    allowUnverifiedEmailLogin: env.ALLOW_UNVERIFIED_EMAIL_LOGIN,
    allowAdminLoginWithoutTotp: env.ALLOW_ADMIN_LOGIN_WITHOUT_TOTP,
  },

  mail: {
    provider: env.MAIL_PROVIDER,
    from: env.MAIL_FROM,
    replyTo: env.MAIL_REPLY_TO,
    awsRegion: env.AWS_REGION,
    sesConfigurationSet: env.SES_CONFIGURATION_SET,
  },

  urls: {
    frontendUrl: env.FRONTEND_URL,
  },

  google: {
    enabled: env.GOOGLE_OAUTH_ENABLED,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: env.GOOGLE_CALLBACK_URL,
  },

  kyc: {
    encryptionKey: env.KYC_ENCRYPTION_KEY,
    uploadUrlTtlSec: env.KYC_UPLOAD_URL_TTL_SEC,
    provider: env.KYC_PROVIDER,
    webhookSecret: env.KYC_WEBHOOK_SECRET,
    defaultApprovedTier: env.KYC_DEFAULT_APPROVED_TIER,
  },

  razorpay: {
    provider: env.RAZORPAY_PROVIDER,
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    apiBase: env.RAZORPAY_API_BASE,
    depositMin: env.INR_DEPOSIT_MIN,
    depositMax: env.INR_DEPOSIT_MAX,
  },

  inrOps: {
    // Maker-checker threshold for manual INR deposits (rupees, scale 2).
    dualApprovalThreshold: env.MANUAL_INR_DUAL_APPROVAL_THRESHOLD,
  },

  scanner: {
    tronProvider: env.TRON_PROVIDER,
    tronGridApiKey: env.TRONGRID_API_KEY,
    tronGridApiBase: env.TRONGRID_API_BASE,
    bscProvider: env.BSC_PROVIDER,
    bscTestnetRpcUrl: env.BSC_TESTNET_RPC_URL,
    safetyLag: env.SCAN_SAFETY_LAG,
    reorgBuffer: env.SCAN_REORG_BUFFER,
    startBlock: env.SCAN_START_BLOCK,
    pollMs: env.SCAN_POLL_MS,
    runInWorker: env.SCAN_RUN_IN_WORKER,
  },

  withdrawal: {
    signer: env.WITHDRAWAL_SIGNER,
    feeUsdt: env.WITHDRAWAL_FEE_USDT,
    minUsdt: env.WITHDRAWAL_MIN_USDT,
    dualApprovalThreshold: env.WITHDRAWAL_DUAL_APPROVAL_THRESHOLD,
    addressCooldownMs: env.WITHDRAWAL_ADDRESS_COOLDOWN_MS,
  },

  chains: {
    // Per-chain block-explorer tx URL prefixes (tx hash appended verbatim).
    explorerTxBase: {
      TRON: env.EXPLORER_TRON_TX_BASE,
      ETHEREUM: env.EXPLORER_ETHEREUM_TX_BASE,
      BSC: env.EXPLORER_BSC_TX_BASE,
    } as Record<string, string>,
    // Chains whose deposits are actively scanned + credited today.
    scanned: env.SCANNED_CHAINS.split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  },

  conversion: {
    priceProvider: env.PRICE_PROVIDER,
    mockUsdtInr: env.CONVERSION_MOCK_USDT_INR,
    spreadBps: env.CONVERSION_SPREAD_BPS,
    feeBps: env.CONVERSION_FEE_BPS,
    tdsBps: env.CONVERSION_TDS_BPS,
    quoteTtlMs: env.CONVERSION_QUOTE_TTL_MS,
  },
} as const;

export type Config = typeof config;
