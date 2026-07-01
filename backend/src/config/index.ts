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
    // Stage 13 temporary bypass: allow unverified users to log in (testing/demo
    // while SES is unapproved). Does not remove email verification.
    allowUnverifiedLogin: env.ALLOW_UNVERIFIED_LOGIN,
    rbacCacheTtlSec: env.RBAC_CACHE_TTL_SEC,
    // Stage 7B — enforce a login geolocation payload (staging opt-in). Default
    // false keeps login working for browsers that block location.
    requireLoginLocation: env.REQUIRE_LOGIN_LOCATION,
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

  // Email OTP (passwordless login/signup, Stage 3A).
  otp: {
    hashSecret: env.OTP_HASH_SECRET,
    ttlMs: env.OTP_TTL_MS,
    maxAttempts: env.OTP_MAX_ATTEMPTS,
    resendCooldownMs: env.OTP_RESEND_COOLDOWN_MS,
    maxPerHour: env.OTP_MAX_PER_HOUR,
  },

  kyc: {
    encryptionKey: env.KYC_ENCRYPTION_KEY,
    uploadUrlTtlSec: env.KYC_UPLOAD_URL_TTL_SEC,
    maxUploadBytes: env.KYC_MAX_UPLOAD_BYTES,
    provider: env.KYC_PROVIDER,
    webhookSecret: env.KYC_WEBHOOK_SECRET,
    defaultApprovedTier: env.KYC_DEFAULT_APPROVED_TIER,
  },

  compliance: {
    livenessProvider: env.KYC_LIVENESS_PROVIDER,
    screeningProvider: env.SCREENING_PROVIDER,
    requireLiveness: env.COMPLIANCE_REQUIRE_LIVENESS,
    requireGeoCapture: env.COMPLIANCE_REQUIRE_GEO_CAPTURE,
    requireSanctionsBeforeApproval: env.COMPLIANCE_REQUIRE_SANCTIONS_BEFORE_APPROVAL,
    defaultRiskLevel: env.COMPLIANCE_DEFAULT_RISK_LEVEL,
    recordRetentionYears: env.COMPLIANCE_RECORD_RETENTION_YEARS,
    // Suspicious-transaction monitoring (Stage 5.2). Detection-only thresholds.
    monitoring: {
      lookbackDays: env.COMPLIANCE_MONITORING_LOOKBACK_DAYS,
      highValueWithdrawal: env.COMPLIANCE_MONITORING_HIGH_VALUE_WITHDRAWAL,
      failedWithdrawalCount: env.COMPLIANCE_MONITORING_FAILED_WITHDRAWAL_COUNT,
      rapidWindowMinutes: env.COMPLIANCE_MONITORING_RAPID_WINDOW_MINUTES,
      structuringBand: env.COMPLIANCE_MONITORING_STRUCTURING_BAND,
      structuringCount: env.COMPLIANCE_MONITORING_STRUCTURING_COUNT,
      abnormalTradingVolume: env.COMPLIANCE_MONITORING_ABNORMAL_TRADING_VOLUME,
    },
    // Wallet risk + Travel Rule foundation (Stage 5.3). Detection/mock only.
    walletRisk: {
      provider: env.WALLET_RISK_PROVIDER,
    },
    travelRule: {
      threshold: env.TRAVEL_RULE_THRESHOLD,
    },
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
    // Manual INR withdrawal bounds (rupees, scale 2).
    withdrawalMin: env.INR_WITHDRAWAL_MIN,
    withdrawalMax: env.INR_WITHDRAWAL_MAX,
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

  // ----------------------------------------------------------------------
  // Master-wallet USDT deposits V1 (Stage 12). Deposit-only: a user sends USDT
  // to ONE EXORA master address per chain and submits the tx hash; the backend
  // verifies it on-chain before crediting. No private keys, no withdrawals, no
  // sweeping, no per-user addresses here.
  //
  // SECURITY: `rpcUrl` / `apiUrl` / `apiKey` are SERVER-ONLY (they may embed
  // provider keys) and must NEVER be returned to any client. The public DTO
  // mapper (crypto-deposit.config.ts) strips them — only masterAddress,
  // networkName, decimals and minConfirmations are user-visible.
  cryptoDeposits: {
    enabled: env.CRYPTO_DEPOSITS_ENABLED,
    networks: {
      BSC: {
        chain: 'BSC' as const,
        family: 'EVM' as const,
        networkName: 'BNB Smart Chain (BEP20)',
        assetSymbol: 'USDT',
        // BEP20 USDT uses 18 decimals (unlike ERC20/TRC20 USDT at 6).
        decimals: 18,
        masterAddress: env.BSC_USDT_MASTER_ADDRESS ?? null,
        tokenContract: env.BSC_USDT_CONTRACT ?? null,
        minConfirmations: env.DEPOSIT_MIN_CONFIRMATIONS_BSC,
        rpcUrl: env.BSC_RPC_URL ?? null,
        apiUrl: null as string | null,
        apiKey: null as string | null,
      },
      ETH: {
        chain: 'ETH' as const,
        family: 'EVM' as const,
        networkName: 'Ethereum (ERC20)',
        assetSymbol: 'USDT',
        decimals: 6,
        masterAddress: env.ETH_USDT_MASTER_ADDRESS ?? null,
        tokenContract: env.ETH_USDT_CONTRACT ?? null,
        minConfirmations: env.DEPOSIT_MIN_CONFIRMATIONS_ETH,
        rpcUrl: env.ETH_RPC_URL ?? null,
        apiUrl: null as string | null,
        apiKey: null as string | null,
      },
      TRON: {
        chain: 'TRON' as const,
        family: 'TRON' as const,
        networkName: 'Tron (TRC20)',
        assetSymbol: 'USDT',
        decimals: 6,
        masterAddress: env.TRON_USDT_MASTER_ADDRESS ?? null,
        tokenContract: env.TRON_USDT_CONTRACT ?? null,
        minConfirmations: env.DEPOSIT_MIN_CONFIRMATIONS_TRON,
        rpcUrl: null as string | null,
        apiUrl: env.TRON_API_URL ?? null,
        apiKey: env.TRONGRID_API_KEY ?? null,
      },
    },
  },

  // ----------------------------------------------------------------------
  // Compliance feature controls — GLOBAL flags (Stage 15).
  //
  // These are the platform-wide kill switches that sit above the per-user
  // feature controls (UserFeatureControls). Effective access for a gated
  // feature is `globalFlag && userFlag`. With the crypto flags off and the
  // INR/trading flags on, the platform runs in INR-only compliance mode until
  // FIU / licensing / travel-rule readiness. NOT secrets — surfaced read-only
  // to the user (/auth/me) and to the admin system console.
  featureFlags: {
    cryptoDepositsGlobalEnabled: env.CRYPTO_DEPOSITS_GLOBAL_ENABLED,
    cryptoWithdrawalsGlobalEnabled: env.CRYPTO_WITHDRAWALS_GLOBAL_ENABLED,
    cryptoWalletGlobalEnabled: env.CRYPTO_WALLET_GLOBAL_ENABLED,
    inrDepositsGlobalEnabled: env.INR_DEPOSITS_GLOBAL_ENABLED,
    inrWithdrawalsGlobalEnabled: env.INR_WITHDRAWALS_GLOBAL_ENABLED,
    tradingGlobalEnabled: env.TRADING_GLOBAL_ENABLED,
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

  // Backup / restore status surface (Stage 9B). Status/documentation only — no
  // backup is ever taken or restored by this app. Values are operator-published
  // metadata, never secrets.
  backup: {
    dbProvider: env.DB_PROVIDER,
    automated: env.DB_BACKUP_AUTOMATED, // 'true' | 'false' | undefined (unknown)
    retentionDays: env.DB_BACKUP_RETENTION_DAYS ?? null,
    latestSnapshotId: env.DB_LATEST_SNAPSHOT_ID ?? null,
    latestSnapshotAt: env.DB_LATEST_SNAPSHOT_AT ?? null,
    restoreTestAt: env.DB_RESTORE_TEST_AT ?? null,
    notes: env.BACKUP_NOTES ?? null,
  },

  // Monitoring / alerts status surface (Stage 9C). Config-driven flags marking
  // which CloudWatch alarms the deploy pipeline has wired. No AWS access here.
  monitoring: {
    dashboardUrl: env.MONITORING_DASHBOARD_URL ?? null,
    alerts: {
      api5xx: env.MONITORING_API_5XX_ALERT,
      admin5xx: env.MONITORING_ADMIN_5XX_ALERT,
      ecsCrash: env.MONITORING_ECS_CRASH_ALERT,
      rds: env.MONITORING_RDS_ALERT,
      // Stage 10E granular RDS alarms; fall back to the combined RDS flag.
      rdsCpu: (env.MONITORING_RDS_CPU_ALERT ?? String(env.MONITORING_RDS_ALERT)) === 'true',
      rdsStorage: (env.MONITORING_RDS_STORAGE_ALERT ?? String(env.MONITORING_RDS_ALERT)) === 'true',
      redis: env.MONITORING_REDIS_ALERT,
      failedLogin: env.MONITORING_FAILED_LOGIN_ALERT,
      withdrawalFailure: env.MONITORING_WITHDRAWAL_FAILURE_ALERT,
      kycQueue: env.MONITORING_KYC_QUEUE_ALERT,
    },
  },

  // Go-live / production infra readiness surface (Stage 10). Status only — no
  // AWS calls, no secrets. URLs/domains/ids are non-sensitive metadata.
  goLive: {
    appEnv: env.APP_ENV ?? null, // 'development' | 'staging' | 'production' | null
    publicApiUrl: env.PUBLIC_API_URL ?? null,
    adminAppUrl: env.ADMIN_APP_URL ?? null,
    publicAppDomain: env.PUBLIC_APP_DOMAIN ?? null,
    adminDomain: env.ADMIN_DOMAIN ?? null,
    apiDomain: env.API_DOMAIN ?? null,
    httpsRequired: env.HTTPS_REQUIRED,
    cookieSecure: env.COOKIE_SECURE,
    cloudfrontDistributionId: env.CLOUDFRONT_DISTRIBUTION_ID ?? null,
    frontendS3Bucket: env.FRONTEND_S3_BUCKET ?? null,
    wafEnabled: env.WAF_ENABLED,
    sms: {
      provider: env.SMS_PROVIDER, // 'none' | 'log' | 'sns' | 'twilio'
      from: env.SMS_FROM ?? null,
    },
    // Go-live checklist acknowledgements (operator-set 'true' only when done).
    checklist: {
      infraCreated: env.GOLIVE_INFRA_CREATED === 'true',
      dnsConfigured: env.GOLIVE_DNS_CONFIGURED === 'true',
      sslActive: env.GOLIVE_SSL_ACTIVE === 'true',
      emailLive: env.GOLIVE_EMAIL_LIVE === 'true',
      backupsVerified: env.GOLIVE_BACKUPS_VERIFIED === 'true',
      restoreDrillDone: env.GOLIVE_RESTORE_DRILL_DONE === 'true',
      monitoringActive: env.GOLIVE_MONITORING_ACTIVE === 'true',
      wafRateLimitActive: env.GOLIVE_WAF_RATELIMIT_ACTIVE === 'true',
      adminAccountsReviewed: env.GOLIVE_ADMIN_ACCOUNTS_REVIEWED === 'true',
      legalApproved: env.GOLIVE_LEGAL_APPROVED === 'true',
      loadTestDone: env.GOLIVE_LOAD_TEST_DONE === 'true',
      pentestDone: env.GOLIVE_PENTEST_DONE === 'true',
      smokeTestPassed: env.GOLIVE_SMOKE_TEST_PASSED === 'true',
    },
  },
} as const;

export type Config = typeof config;
