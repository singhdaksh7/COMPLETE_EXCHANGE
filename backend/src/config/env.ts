import dotenv from 'dotenv';
import { z } from 'zod';
import { productionSafetyIssues } from '../lib/prod-safety';

// Load .env before validation. In production the platform injects real
// environment variables, so a missing .env file is not an error.
dotenv.config();

/**
 * Single source of truth for runtime configuration.
 *
 * The schema is intentionally strict: the process refuses to boot with an
 * invalid or missing variable rather than failing later at request time.
 * This is a custodial financial system — fail fast, fail loud.
 */
const DEV_ONLY_VALUES = new Set([
  'change_me_access_secret_min_32_chars_long_value',
  'change_me_refresh_secret_min_32_chars_long_value',
  'dev-only-change-me-kyc-pii-encryption-key',
  'dev-only-kyc-webhook-secret-change-me',
  'dev-only-razorpay-key-secret-change-me',
  'dev-only-razorpay-webhook-secret-change-me',
]);

const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalNonEmptyString = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().url().optional());

export const envSchema = z
  .object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  // Admin API runs as a SEPARATE process (admin-server.ts) on its own port and
  // hostname, reachable only via VPN/IP allowlist (ARCHITECTURE.md §1.2, §12).
  ADMIN_PORT: z.coerce.number().int().positive().default(4001),
  ADMIN_API_PREFIX: z.string().startsWith('/').default('/admin/v1'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  BODY_LIMIT: z.string().default('100kb'),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  LOG_PRETTY: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // Account-level brute-force lockout. After MAX failed login attempts for an
  // account within the rolling WINDOW, further attempts are rejected even with
  // correct credentials until the window passes (dimension: email + IP).
  LOGIN_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900_000), // 15 minutes

  // Single-use, hashed-in-Redis tokens for email verification & password reset.
  // The DB schema is frozen (no token columns), so these live in Redis with TTL.
  EMAIL_VERIFICATION_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(86_400_000), // 24h
  PASSWORD_RESET_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3_600_000), // 1h
  // Gate first login on a verified email. Disable only for local smoke testing.
  REQUIRE_EMAIL_VERIFICATION: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  // TTL of the per-user RBAC permission cache in Redis (seconds).
  RBAC_CACHE_TTL_SEC: z.coerce.number().int().positive().default(60),

  // ---- EMAIL / MAILER ----
  // Provider selection. 'log' is a fully-offline stub (dev + tests) that records
  // to an in-memory outbox and logs the dispatch; 'ses' sends real email via AWS
  // SES (staging/prod). 'ses' requires AWS_REGION (enforced in superRefine).
  MAIL_PROVIDER: z.enum(['log', 'ses']).default('log'),
  // From identity for outbound mail. In 'ses' mode this MUST be an SES-verified
  // identity in AWS_REGION. Accepts "Name <addr@domain>" or a bare address.
  MAIL_FROM: z.string().min(3).default('Exora <no-reply@exora.local>'),
  // Optional Reply-To for outbound mail (e.g. support@exorain.com). When set,
  // it is attached as SES ReplyToAddresses; when unset, no Reply-To is sent.
  // This is NEVER used as the send identity — only MAIL_FROM is.
  MAIL_REPLY_TO: optionalNonEmptyString,
  // Public base URL of the frontend, used to build verification/reset links.
  // Trailing slashes are stripped so links never become "//verify-email".
  FRONTEND_URL: z
    .string()
    .url()
    .default('http://localhost:3000')
    .transform((v) => v.replace(/\/+$/, '')),
  // AWS region for SES. Required only in 'ses' mode (enforced in superRefine).
  AWS_REGION: optionalNonEmptyString,
  // Optional SES configuration set for bounce/complaint tracking.
  SES_CONFIGURATION_SET: optionalNonEmptyString,

  // ---- GOOGLE OAUTH ----
  // Off by default. When enabled, CLIENT_ID/SECRET/CALLBACK_URL are required
  // (enforced in superRefine) and the /auth/google/* routes go live; otherwise
  // they respond with a clear "disabled" error.
  GOOGLE_OAUTH_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  GOOGLE_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
  // Must exactly match an Authorized Redirect URI on the Google OAuth client,
  // e.g. https://api.example.com/api/v1/auth/google/callback
  GOOGLE_CALLBACK_URL: optionalUrl,

  // ---- KYC ----
  // Secret used to derive the AES-256-GCM key that seals KYC PII (PAN, Aadhaar
  // ref) into the frozen `*_enc` Bytes columns. Production MUST supply a strong,
  // externally-managed value (KMS-wrapped); the dev default only unblocks local
  // and test runs and is NOT safe for real data.
  KYC_ENCRYPTION_KEY: z
    .string()
    .min(16, 'KYC_ENCRYPTION_KEY must be >= 16 chars')
    .default('dev-only-change-me-kyc-pii-encryption-key'),
  // Lifetime of the (stub) presigned document upload URL, seconds.
  KYC_UPLOAD_URL_TTL_SEC: z.coerce.number().int().positive().default(900),
  // Generic KYC provider selection. 'mock' is a fully-offline deterministic
  // stub; 'external' is the real vendor and stays a throwing stub until a
  // vendor is finalized and wired (Phase 3).
  KYC_PROVIDER: z.enum(['mock', 'external']).default('mock'),
  // HMAC secret used to verify inbound KYC provider webhooks over the raw body.
  // The dev default only unblocks local/test runs and is NOT safe for prod.
  KYC_WEBHOOK_SECRET: z
    .string()
    .min(8, 'KYC_WEBHOOK_SECRET must be >= 8 chars')
    .default('dev-only-kyc-webhook-secret-change-me'),
  // Default KYC tier granted on approval when the reviewer omits an explicit one.
  KYC_DEFAULT_APPROVED_TIER: z.coerce.number().int().min(1).max(5).default(1),

  // ---- INR DEPOSITS / RAZORPAY ----
  // Provider selection. 'mock' is a fully-offline deterministic stub used in dev
  // and tests; 'live' talks to the real Razorpay API and REQUIRES real keys.
  // The provider resolver refuses to boot in 'live' without key id + secret, so
  // we can never accidentally hit Razorpay with placeholder credentials.
  RAZORPAY_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  // Razorpay API key id ('rzp_test_...'/'rzp_live_...'). Optional in mock mode.
  RAZORPAY_KEY_ID: optionalNonEmptyString,
  // Razorpay key secret — signs orders and verifies payment signatures. In mock
  // mode a deterministic dev default is used so tests can compute signatures.
  RAZORPAY_KEY_SECRET: z
    .preprocess(
      emptyStringToUndefined,
      z
        .string()
        .min(8, 'RAZORPAY_KEY_SECRET must be >= 8 chars')
        .default('dev-only-razorpay-key-secret-change-me'),
    ),
  // Razorpay webhook signing secret — verifies inbound webhook authenticity.
  RAZORPAY_WEBHOOK_SECRET: z
    .preprocess(
      emptyStringToUndefined,
      z
        .string()
        .min(8, 'RAZORPAY_WEBHOOK_SECRET must be >= 8 chars')
        .default('dev-only-razorpay-webhook-secret-change-me'),
    ),
  // Base URL for the real Razorpay REST API (only used by the live provider).
  RAZORPAY_API_BASE: z.string().url().default('https://api.razorpay.com/v1'),
  // INR deposit bounds (rupees, scale 2). Enforced before an order is created.
  INR_DEPOSIT_MIN: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('100.00'),
  INR_DEPOSIT_MAX: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('1000000.00'),
  // Manual INR deposits at/above this amount require dual approval
  // (maker-checker): a first admin approves, then a DIFFERENT second admin
  // credits. Below it, a single approval credits as before.
  MANUAL_INR_DUAL_APPROVAL_THRESHOLD: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('50000.00'),

  // ---- CRYPTO DEPOSIT SCANNER (TRON / TRC20 USDT) ----
  // Provider selection. 'mock' is fully offline/deterministic (dev + tests);
  // 'live' talks to TronGrid and REQUIRES an API key, so we never hammer the
  // real network with placeholder credentials.
  TRON_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  // TronGrid API key — required only in 'live' mode (resolver enforces).
  TRONGRID_API_KEY: z.string().optional(),
  TRONGRID_API_BASE: z.string().url().default('https://api.trongrid.io'),

  // ---- CRYPTO DEPOSIT SCANNER (BSC / BEP20 USDT) ----
  BSC_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  BSC_TESTNET_RPC_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().default('https://data-seed-prebsc-1-s1.bnbchain.org:8545'),
  ),
  // How far behind the chain head we scan (avoid the unstable tip). Detection
  // happens here; crediting waits for min-confirmations depth.
  SCAN_SAFETY_LAG: z.coerce.number().int().min(0).default(1),
  // Rolling re-scan window (blocks) for reorg detection. Detection is an upsert,
  // so re-scanning is idempotent; a changed block hash flips uncredited deposits
  // to ORPHANED before they can ever be credited.
  SCAN_REORG_BUFFER: z.coerce.number().int().min(1).default(32),
  // Block to begin scanning from when no cursor exists yet.
  SCAN_START_BLOCK: z.coerce.number().int().min(0).default(0),
  // Scanner poll interval (ms).
  SCAN_POLL_MS: z.coerce.number().int().positive().default(5_000),
  // Register the TRON scanner inside the shared worker process (worker.ts).
  // Off by default — the dedicated scanner process (scanner.ts) runs it. Enable
  // when consolidating onto the worker scaffold. Crediting is idempotent, so
  // even if both run, no double-credit occurs.
  SCAN_RUN_IN_WORKER: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // ---- CRYPTO WITHDRAWALS (TRON / TRC20 USDT) ----
  // Signer selection. 'mock' performs NO real signing or broadcasting (no keys,
  // no network). 'live' is intentionally unimplemented — the resolver refuses to
  // select it, so we can never sign/broadcast a real transaction by accident.
  WITHDRAWAL_SIGNER: z.enum(['mock', 'live']).default('mock'),
  // Flat platform withdrawal fee in USDT (decimal string). netAmount = amount-fee.
  WITHDRAWAL_FEE_USDT: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/)
    .default('1'),
  WITHDRAWAL_MIN_USDT: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/)
    .default('10'),
  WITHDRAWAL_DUAL_APPROVAL_THRESHOLD: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/)
    .default('1000'),
  // Cooling-off before a newly-added withdrawal address can be used (ms).
  // Default 0 makes addresses usable immediately (dev/test); production sets >0.
  // RECOMMENDED for staging/production: 86400000 (24h) to match the documented
  // UX. Left at 0 here so dev/test are unaffected (no env change in this phase).
  WITHDRAWAL_ADDRESS_COOLDOWN_MS: z.coerce.number().int().min(0).default(0),

  // ---- CHAIN EXPLORERS (tx URL bases for deposit/withdrawal links) ----
  // Block-explorer transaction URL prefixes; the tx hash is appended verbatim.
  EXPLORER_TRON_TX_BASE: z
    .string()
    .url()
    .default('https://tronscan.org/#/transaction/'),
  EXPLORER_ETHEREUM_TX_BASE: z.string().url().default('https://etherscan.io/tx/'),
  EXPLORER_BSC_TX_BASE: z.string().url().default('https://bscscan.com/tx/'),
  // Comma-separated chains whose deposits are ACTIVELY scanned + credited today.
  // Only TRON is wired (TRC20 USDT); others can derive an address but deposits
  // there are not yet detected — the UI warns users accordingly.
  SCANNED_CHAINS: z.string().default('TRON'),

  // ---- INR ↔ USDT CONVERSION ----
  // Price provider. 'mock' is a deterministic offline mid-price; 'live' (KuCoin
  // etc.) is intentionally unimplemented — the resolver refuses to select it.
  PRICE_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  // Mock mid-market price: INR per 1 USDT (decimal string, never a float).
  CONVERSION_MOCK_USDT_INR: z
    .string()
    .regex(/^\d+(\.\d{1,8})?$/)
    .default('90.00'),
  // Platform spread (bps) baked into the quoted rate (buy higher, sell lower).
  CONVERSION_SPREAD_BPS: z.coerce.number().int().min(0).max(10_000).default(50),
  // Platform conversion fee (bps), charged in INR.
  CONVERSION_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(20),
  // §194S TDS (bps) withheld on crypto SELL (USDT→INR). 100 bps = 1%.
  CONVERSION_TDS_BPS: z.coerce.number().int().min(0).max(10_000).default(100),
  // Quote lifetime (ms). Short-lived; expired quotes are rejected at execution.
  CONVERSION_QUOTE_TTL_MS: z.coerce.number().int().positive().default(30_000),

  // ---- PRODUCTION SAFETY OVERRIDES (Stage 4.2) ----
  // Staging runs NODE_ENV=production with offline/mock services and may run
  // admins without TOTP. Each unsafe-in-production toggle is blocked at startup
  // UNLESS its clearly-named override below is explicitly set to 'true'. A real
  // production deployment leaves these false so it fails fast on unsafe config.
  // DO NOT set any of these in a genuine production environment.
  ALLOW_MOCK_PROVIDERS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  ALLOW_MOCK_WITHDRAWAL_SIGNER: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  ALLOW_LOG_MAIL_PROVIDER: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  ALLOW_UNVERIFIED_EMAIL_LOGIN: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  ALLOW_ADMIN_LOGIN_WITHOUT_TOTP: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  })
  // Fail fast: 'ses' mode is useless (and silently drops mail) without a region.
  .superRefine((val, ctx) => {
    const productionLike = val.NODE_ENV === 'production';
    if (productionLike && val.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must be set in production',
      });
    }
    if (productionLike) {
      for (const key of [
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'KYC_ENCRYPTION_KEY',
        'KYC_WEBHOOK_SECRET',
      ] as const) {
        if (DEV_ONLY_VALUES.has(val[key])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} must not use a dev/default placeholder in production`,
          });
        }
      }
    }
    if (val.MAIL_PROVIDER === 'ses' && !val.AWS_REGION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AWS_REGION'],
        message: 'AWS_REGION is required when MAIL_PROVIDER=ses',
      });
    }
    // Production-safety: refuse to boot with unsafe staging/demo toggles in
    // production unless each is explicitly acknowledged via its ALLOW_* override.
    for (const issue of productionSafetyIssues({
      nodeEnv: val.NODE_ENV,
      tronProvider: val.TRON_PROVIDER,
      bscProvider: val.BSC_PROVIDER,
      priceProvider: val.PRICE_PROVIDER,
      razorpayProvider: val.RAZORPAY_PROVIDER,
      kycProvider: val.KYC_PROVIDER,
      withdrawalSigner: val.WITHDRAWAL_SIGNER,
      mailProvider: val.MAIL_PROVIDER,
      requireEmailVerification: val.REQUIRE_EMAIL_VERIFICATION,
      allowMockProviders: val.ALLOW_MOCK_PROVIDERS,
      allowMockWithdrawalSigner: val.ALLOW_MOCK_WITHDRAWAL_SIGNER,
      allowLogMailProvider: val.ALLOW_LOG_MAIL_PROVIDER,
      allowUnverifiedEmailLogin: val.ALLOW_UNVERIFIED_EMAIL_LOGIN,
    })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [issue.path],
        message: issue.message,
      });
    }
    // Fail fast: don't boot with OAuth "enabled" but unconfigured.
    if (val.GOOGLE_OAUTH_ENABLED) {
      for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'] as const) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when GOOGLE_OAUTH_ENABLED=true`,
          });
        }
      }
    }
    if (val.TRON_PROVIDER === 'live' && !val.TRONGRID_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRONGRID_API_KEY'],
        message: 'TRONGRID_API_KEY is required when TRON_PROVIDER=live',
      });
    }
    if (val.BSC_PROVIDER === 'live' && !val.BSC_TESTNET_RPC_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BSC_TESTNET_RPC_URL'],
        message: 'BSC_TESTNET_RPC_URL is required when BSC_PROVIDER=live',
      });
    }
    if (val.RAZORPAY_PROVIDER === 'live') {
      for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const) {
        if (!val[key] || DEV_ONLY_VALUES.has(val[key])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required and must not be a dev placeholder when RAZORPAY_PROVIDER=live`,
          });
        }
      }
    }
  });

export type ParsedEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: NodeJS.ProcessEnv): ParsedEnv {
  return envSchema.parse(raw);
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // We cannot use the structured logger here — it depends on this config.
  const flattened = parsed.error.flatten();
  // eslint-disable-next-line no-console
  console.error(
    'Invalid environment configuration during startup. The process will exit before logger initialization.',
    JSON.stringify(
      {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        fieldErrors: flattened.fieldErrors,
        formErrors: flattened.formErrors,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

export type Env = typeof env;
