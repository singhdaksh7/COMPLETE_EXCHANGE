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
  'dev-only-change-me-email-otp-hmac-secret',
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
  // TEMPORARY TESTING/DEMO BYPASS (Stage 13). When true, login succeeds for
  // unverified users even while REQUIRE_EMAIL_VERIFICATION stays true — used
  // while Amazon SES approval is pending. Default false = no behaviour change.
  // The email verification system itself (routes/tokens/OTP) is untouched; this
  // only relaxes the login gate. Surfaced as a staging/demo risk on /admin/system.
  ALLOW_UNVERIFIED_LOGIN: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // TTL of the per-user RBAC permission cache in Redis (seconds).
  RBAC_CACHE_TTL_SEC: z.coerce.number().int().positive().default(60),
  // Stage 7B — require a browser geolocation payload on user login. Default OFF
  // so existing behaviour is unchanged and no user is ever locked out by a
  // browser that blocks location. Staging may set 'true' to enforce it: the
  // login API then rejects a missing location with LOCATION_REQUIRED. This is a
  // security/audit signal only — it is NOT a fraud-proof control (browser
  // geolocation is user-consented and spoofable).
  REQUIRE_LOGIN_LOCATION: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // ---- EMAIL / MAILER ----
  // Provider selection. 'log' is a fully-offline stub (dev + tests) that records
  // to an in-memory outbox and logs the dispatch; 'ses' sends real email via AWS
  // SES (staging/prod, requires AWS_REGION); 'resend' sends via the Resend API
  // (Stage 12, requires RESEND_API_KEY + RESEND_FROM_EMAIL — enforced below).
  MAIL_PROVIDER: z.enum(['log', 'ses', 'resend']).default('log'),
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

  // ---- RESEND (Stage 12) ----
  // Transactional email via Resend. Required only when MAIL_PROVIDER=resend
  // (enforced in superRefine). The operator has not provisioned these yet —
  // left unset, MAIL_PROVIDER stays 'log' and nothing here is read.
  RESEND_API_KEY: optionalNonEmptyString,
  // Verified Resend sending identity, e.g. "Exora <no-reply@mail.exorain.com>"
  // or a bare address. Kept separate from MAIL_FROM so switching to Resend
  // never silently reuses an SES-only identity that Resend has not verified.
  RESEND_FROM_EMAIL: optionalNonEmptyString,
  RESEND_FROM_NAME: z.string().trim().min(1).default('Exora'),
  // Svix signing secret for the inbound Resend webhook (delivery/bounce
  // events). Optional: absent = the webhook route verifies nothing and
  // rejects every event as unverified (never silently "succeeds").
  RESEND_WEBHOOK_SECRET: optionalNonEmptyString,

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

  // ---- FEDERATED IDENTITY / FIREBASE (Stage 12) ----
  // Firebase Authentication is a verification layer only — EXORA remains
  // authoritative for users/sessions/tokens (see auth.federated.service.ts).
  // Off by default. Deliberately DOES NOT use the GOOGLE_OAUTH_ENABLED
  // fail-fast-at-boot pattern: the operator has not provisioned Firebase
  // credentials yet, and per design this must never crash unrelated app boot.
  // Enabling the flag without configuring the verifier below is safe — the
  // federated endpoint returns a clear provider-unavailable response instead
  // of creating users or issuing sessions (see federated-identity-verifier.ts).
  FEDERATED_AUTH_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  FIREBASE_PROJECT_ID: optionalNonEmptyString,
  // Firebase Admin service-account credential (three-field form — avoids
  // shipping a whole escaped JSON blob through .env). All three required
  // together for the verifier to initialize; partially-set is treated as
  // "not configured" (never a crash, never a partial/bypassed verifier).
  FIREBASE_CLIENT_EMAIL: optionalNonEmptyString,
  FIREBASE_PRIVATE_KEY: optionalNonEmptyString,

  // ---- EMAIL OTP (passwordless login/signup, Stage 3A) ----
  // Server secret used to key the HMAC over each OTP code. A DB leak alone is
  // useless without this secret (no offline brute force of the 6-digit space).
  // Production MUST supply a strong, externally-managed value; the dev default
  // only unblocks local + test runs.
  OTP_HASH_SECRET: z
    .string()
    .min(16, 'OTP_HASH_SECRET must be >= 16 chars')
    .default('dev-only-change-me-email-otp-hmac-secret'),
  // OTP lifetime (ms). Spec: 5–10 minutes. Default 10 minutes.
  OTP_TTL_MS: z.coerce.number().int().positive().default(600_000),
  // Maximum verify attempts before a code is locked.
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // Minimum gap between two code sends to the same email (ms). Default 60s.
  OTP_RESEND_COOLDOWN_MS: z.coerce.number().int().positive().default(60_000),
  // Hard cap on codes issued to one email within the rolling hour (anti-abuse).
  OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(6),

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
  // Maximum accepted KYC document upload size, bytes. The file itself is
  // uploaded directly to object storage via a presigned URL; this bound is
  // enforced server-side before the URL is issued (and would be embedded as the
  // presigned content-length-range condition in a real implementation). Default
  // 10 MiB — generous for a PDF/JPEG/PNG identity document.
  KYC_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
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
  // Document object-storage provider. 'mock' (default) is a non-routable stub —
  // document bytes are never actually persisted. 's3' requires KYC_S3_BUCKET +
  // KYC_S3_REGION/AWS_REGION (enforced below) and fails loudly if absent rather
  // than silently degrading to the mock host in a real environment.
  KYC_STORAGE_PROVIDER: z.enum(['mock', 's3']).default('mock'),
  KYC_S3_BUCKET: optionalNonEmptyString,
  KYC_S3_REGION: optionalNonEmptyString,
  // Customer-managed KMS key id/ARN for SSE-KMS. Optional — falls back to
  // SSE-S3 (AES256) when absent, but a CMK is required before this is treated
  // as production-ready (see docs/security/kms-readiness.md).
  KYC_S3_KMS_KEY_ID: optionalNonEmptyString,

  // Operator-controlled attestation that the configured INR deposit transfer
  // instructions (bank/UPI details, below) have been confirmed as the real,
  // current collection destination. Defaults to FALSE — must never be set
  // true automatically by code; only a human who has verified the banking
  // details should flip this. While false, the instructions endpoint returns
  // a safe "temporarily unavailable" state instead of the account/UPI values.
  INR_DEPOSIT_INSTRUCTIONS_VERIFIED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // ---- COMPLIANCE / FIU-PMLA (Stage 5.0) ----
  // Liveness provider selection. 'mock' is a fully-offline deterministic stub
  // (default). 'external' is reserved for a future vendor (Digilocker/HyperVerge/
  // Signzy/IDfy/Onfido) and is not implemented yet — selecting it falls back to
  // the mock so wiring can be exercised safely.
  KYC_LIVENESS_PROVIDER: z.enum(['mock', 'external']).default('mock'),
  // Sanctions / PEP / adverse-media screening provider (Stage 5.1). Only the
  // offline mock is implemented; 'external' is accepted for wiring but falls
  // back to the mock so no real paid vendor is ever called from staging.
  SCREENING_PROVIDER: z.enum(['mock', 'external']).default('mock'),
  // Gates evaluated by the compliance risk engine / approval flow. In staging
  // these default to permissive so the mock onboarding can complete end-to-end;
  // production should enable them and wire real screening/liveness.
  COMPLIANCE_REQUIRE_LIVENESS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  COMPLIANCE_REQUIRE_GEO_CAPTURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  COMPLIANCE_REQUIRE_SANCTIONS_BEFORE_APPROVAL: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // Baseline risk grade applied when no risk signals are present.
  COMPLIANCE_DEFAULT_RISK_LEVEL: z
    .enum(['LOW', 'MEDIUM', 'HIGH', 'PROHIBITED'])
    .default('MEDIUM'),
  // Record-retention baseline (years). Compliance rows are stamped with a
  // retentionUntil for audit; records are NEVER auto-deleted by this code.
  COMPLIANCE_RECORD_RETENTION_YEARS: z.coerce.number().int().min(1).max(25).default(5),

  // ---- COMPLIANCE MONITORING (Stage 5.2) ----
  // Rule thresholds for the suspicious-transaction monitoring engine. These are
  // detection-only heuristics: alerts/cases are created but trading/withdrawals
  // are NEVER blocked by this engine. All amounts are in the asset's human unit.
  // Lookback window (days) for the windowed rules (structuring, abnormal volume,
  // repeated failed withdrawals, rapid deposit->withdrawal correlation).
  COMPLIANCE_MONITORING_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // A single crypto withdrawal at/above this human amount is high-value.
  COMPLIANCE_MONITORING_HIGH_VALUE_WITHDRAWAL: z.coerce.number().min(0).default(10000),
  // Repeated FAILED/REJECTED withdrawals in the window at/above this count.
  COMPLIANCE_MONITORING_FAILED_WITHDRAWAL_COUNT: z.coerce.number().int().min(1).default(3),
  // Rapid deposit -> withdrawal correlation window (minutes).
  COMPLIANCE_MONITORING_RAPID_WINDOW_MINUTES: z.coerce.number().int().min(1).default(60),
  // Structuring: >= COUNT transfers each strictly below BAND within the window.
  COMPLIANCE_MONITORING_STRUCTURING_BAND: z.coerce.number().min(0).default(10000),
  COMPLIANCE_MONITORING_STRUCTURING_COUNT: z.coerce.number().int().min(2).default(3),
  // Abnormal trading: summed quote-amount in the window at/above this value.
  COMPLIANCE_MONITORING_ABNORMAL_TRADING_VOLUME: z.coerce.number().min(0).default(100000),

  // ---- WALLET RISK + TRAVEL RULE (Stage 5.3) ----
  // Wallet-risk screening provider. Only the offline mock is implemented;
  // 'external' is accepted for wiring but falls back to the mock so no real paid
  // chain-analytics vendor is ever called from staging.
  WALLET_RISK_PROVIDER: z.enum(['mock', 'external']).default('mock'),
  // Travel Rule threshold (human asset units). Transfers at/above this amount
  // require Travel Rule data collection (mock lifecycle only — never a real
  // VASP/Travel Rule message is transmitted).
  TRAVEL_RULE_THRESHOLD: z.coerce.number().min(0).default(1000),

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
  // Manual INR deposit transfer destination (Stage 10A). Moved out of the
  // frontend source (previously hardcoded client-side) into config so web and
  // mobile both read the same backend-served source of truth via
  // GET /inr/deposits/instructions. These are the staging demo bank/UPI
  // details already in use for the manual-transfer flow — not secrets.
  INR_DEPOSIT_BANK_NAME: z.string().trim().min(1).default('HDFC Bank'),
  INR_DEPOSIT_BENEFICIARY_NAME: z
    .string()
    .trim()
    .min(1)
    .default('Exora India Private Limited'),
  INR_DEPOSIT_ACCOUNT_NUMBER: z.string().trim().min(1).default('50200084192837'),
  INR_DEPOSIT_IFSC: z.string().trim().min(1).default('HDFC0000240'),
  INR_DEPOSIT_ACCOUNT_TYPE: z.string().trim().min(1).default('Current Account'),
  INR_DEPOSIT_UPI_ID: z.string().trim().min(1).default('exora.india@icici'),
  // Manual INR deposits at/above this amount require dual approval
  // (maker-checker): a first admin approves, then a DIFFERENT second admin
  // credits. Below it, a single approval credits as before.
  MANUAL_INR_DUAL_APPROVAL_THRESHOLD: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('50000.00'),
  // INR withdrawal bounds (rupees, scale 2). Enforced before funds are reserved.
  INR_WITHDRAWAL_MIN: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('100.00'),
  INR_WITHDRAWAL_MAX: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('1000000.00'),

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

  // ---- BACKUP / RESTORE STATUS (Stage 9B) ----
  // Documentation/status surface only — this app NEVER takes or restores
  // backups. AWS owns the actual RDS automated backups + snapshots; these
  // OPTIONAL variables let the deploy pipeline publish backup metadata into the
  // admin console so operators can verify posture. Absent = "unknown" in the UI
  // (a warning), never a hard failure. No secret/connection material here.
  DB_PROVIDER: z.string().default('postgresql (Amazon RDS)'),
  DB_BACKUP_AUTOMATED: optionalNonEmptyString, // 'true' | 'false'
  DB_BACKUP_RETENTION_DAYS: z.coerce.number().int().min(0).optional(),
  DB_LATEST_SNAPSHOT_ID: optionalNonEmptyString,
  DB_LATEST_SNAPSHOT_AT: optionalNonEmptyString, // ISO timestamp
  DB_RESTORE_TEST_AT: optionalNonEmptyString, // ISO timestamp of last restore drill
  BACKUP_NOTES: optionalNonEmptyString,

  // ---- MONITORING / ALERTS STATUS (Stage 9C) ----
  // Documentation/status surface only — alarms live in AWS CloudWatch. Each
  // OPTIONAL flag lets the deploy pipeline mark an alarm as configured so the
  // admin console can show configured/missing without touching AWS APIs or
  // exposing any secret. Default 'false' = not yet configured (shown as a gap).
  MONITORING_API_5XX_ALERT: z.string().default('false').transform((v) => v === 'true'),
  MONITORING_ADMIN_5XX_ALERT: z.string().default('false').transform((v) => v === 'true'),
  MONITORING_ECS_CRASH_ALERT: z.string().default('false').transform((v) => v === 'true'),
  MONITORING_RDS_ALERT: z.string().default('false').transform((v) => v === 'true'),
  // Stage 10E splits the single RDS alarm into CPU vs storage. RDS_ALERT above
  // remains the combined/back-compat flag; when these granular flags are unset
  // they fall back to MONITORING_RDS_ALERT (resolved in config/index.ts).
  MONITORING_RDS_CPU_ALERT: optionalNonEmptyString, // 'true' | 'false'
  MONITORING_RDS_STORAGE_ALERT: optionalNonEmptyString, // 'true' | 'false'
  MONITORING_REDIS_ALERT: z.string().default('false').transform((v) => v === 'true'),
  MONITORING_FAILED_LOGIN_ALERT: z.string().default('false').transform((v) => v === 'true'),
  MONITORING_WITHDRAWAL_FAILURE_ALERT: z.string().default('false').transform((v) => v === 'true'),
  MONITORING_KYC_QUEUE_ALERT: z.string().default('false').transform((v) => v === 'true'),
  // Optional dashboard/runbook URL operators can click through to (non-secret).
  MONITORING_DASHBOARD_URL: optionalUrl,

  // ---- GO-LIVE / PRODUCTION INFRA READINESS (Stage 10) ----
  // Status/documentation surface only — these describe the intended production
  // posture so the admin console can report ready/warning/blocked. All OPTIONAL
  // and boot-safe; NONE are secrets. No AWS API is ever called from the app.

  // Deployment target. Distinguishes staging from production even though staging
  // runs NODE_ENV=production (Stage 4.2). Drives blocker-vs-warning severity.
  APP_ENV: z.enum(['development', 'staging', 'production']).optional(),

  // Public URLs (used for go-live separation checks; never secrets).
  PUBLIC_API_URL: optionalUrl, // public API base, e.g. https://api.exora.com
  ADMIN_APP_URL: optionalUrl, // admin dashboard base, e.g. https://admin.exora.com

  // Production domains (host names only).
  PUBLIC_APP_DOMAIN: optionalNonEmptyString,
  ADMIN_DOMAIN: optionalNonEmptyString,
  API_DOMAIN: optionalNonEmptyString,

  // TLS / cookie posture. Auth uses bearer tokens (no cookies) today, so
  // COOKIE_SECURE is informational; HTTPS_REQUIRED reflects the edge policy.
  HTTPS_REQUIRED: z.string().default('false').transform((v) => v === 'true'),
  COOKIE_SECURE: z.string().default('false').transform((v) => v === 'true'),

  // CDN / static frontend (CloudFront + S3). Ids/names only — not secrets.
  CLOUDFRONT_DISTRIBUTION_ID: optionalNonEmptyString,
  FRONTEND_S3_BUCKET: optionalNonEmptyString,

  // SMS provider (optional capability). 'none' = SMS not in use → checks are
  // informational/skipped; 'log' is a staging stub; others are real providers.
  SMS_PROVIDER: z.enum(['none', 'log', 'sns', 'twilio']).default('none'),
  SMS_FROM: optionalNonEmptyString,

  // Edge security perimeter. WAF lives at the CDN/edge (ARCHITECTURE.md §10);
  // this flag lets the deploy pipeline assert it is configured.
  WAF_ENABLED: z.string().default('false').transform((v) => v === 'true'),

  // Go-live checklist acknowledgements (Stage 10H). Each OPTIONAL flag is set to
  // 'true' by an operator ONLY when that item is genuinely complete — there is
  // no auto-complete. Default unset = "pending" in the UI.
  GOLIVE_INFRA_CREATED: optionalNonEmptyString,
  GOLIVE_DNS_CONFIGURED: optionalNonEmptyString,
  GOLIVE_SSL_ACTIVE: optionalNonEmptyString,
  GOLIVE_EMAIL_LIVE: optionalNonEmptyString,
  GOLIVE_BACKUPS_VERIFIED: optionalNonEmptyString,
  GOLIVE_RESTORE_DRILL_DONE: optionalNonEmptyString,
  GOLIVE_MONITORING_ACTIVE: optionalNonEmptyString,
  GOLIVE_WAF_RATELIMIT_ACTIVE: optionalNonEmptyString,
  GOLIVE_ADMIN_ACCOUNTS_REVIEWED: optionalNonEmptyString,
  GOLIVE_LEGAL_APPROVED: optionalNonEmptyString,
  GOLIVE_LOAD_TEST_DONE: optionalNonEmptyString,
  GOLIVE_PENTEST_DONE: optionalNonEmptyString,
  GOLIVE_SMOKE_TEST_PASSED: optionalNonEmptyString,

  // ---- MASTER-WALLET USDT DEPOSITS V1 (Stage 12) ----
  // Deposit-only real USDT via ONE EXORA master receiving address per chain.
  // A user sends USDT to the master address and submits the tx hash; the backend
  // verifies it on-chain before crediting. NO private keys, NO withdrawals, NO
  // sweeping, NO per-user addresses in V1 (the models are designed so those are
  // a future additive upgrade). RPC URLs / API keys are SERVER-ONLY and are
  // NEVER returned to the frontend.
  //
  // Master kill switch. When false, the user/admin crypto-deposit surfaces still
  // load but report the feature as disabled and accept no submissions.
  CRYPTO_DEPOSITS_ENABLED: z.string().default('false').transform((v) => v === 'true'),

  // ---- COMPLIANCE FEATURE CONTROLS — GLOBAL FLAGS (Stage 15) ----
  // Global kill-switches that sit ABOVE per-user feature controls. A feature is
  // effectively available to a user only when BOTH the global flag here AND the
  // user's per-user control are enabled (logical AND). These exist so the whole
  // platform can run in an "INR-only" compliance mode: INR deposit/withdrawal
  // and trading stay on, while ALL crypto rails stay off until FIU / licensing /
  // travel-rule compliance is ready — regardless of any per-user toggle.
  //
  // Crypto defaults are OFF (staging compliance posture). INR + trading default
  // ON. Existing Stage 12 master-wallet deposit code is untouched; it simply
  // becomes inaccessible while the crypto globals are off.
  CRYPTO_DEPOSITS_GLOBAL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  CRYPTO_WITHDRAWALS_GLOBAL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  CRYPTO_WALLET_GLOBAL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  INR_DEPOSITS_GLOBAL_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  INR_WITHDRAWALS_GLOBAL_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  TRADING_GLOBAL_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),

  // EXORA master RECEIVING addresses (public — shown to users). Optional: a
  // chain with no master address is treated as not-configured / disabled.
  BSC_USDT_MASTER_ADDRESS: optionalNonEmptyString,
  ETH_USDT_MASTER_ADDRESS: optionalNonEmptyString,
  TRON_USDT_MASTER_ADDRESS: optionalNonEmptyString,

  // USDT token contract addresses per chain (public). A transfer is only
  // accepted when its log address matches the configured contract for the chain.
  BSC_USDT_CONTRACT: optionalNonEmptyString,
  ETH_USDT_CONTRACT: optionalNonEmptyString,
  TRON_USDT_CONTRACT: optionalNonEmptyString,

  // JSON-RPC / API endpoints used SERVER-SIDE for on-chain verification.
  // SECRET-ish (may embed keys): never exposed to the frontend.
  BSC_RPC_URL: optionalUrl,
  ETH_RPC_URL: optionalUrl,
  TRON_API_URL: optionalUrl, // TronGrid base, e.g. https://api.trongrid.io
  // NOTE: TRONGRID_API_KEY is already defined above (scanner) and is reused here.

  // Required confirmations before a deposit is credited (per chain).
  DEPOSIT_MIN_CONFIRMATIONS_BSC: z.coerce.number().int().min(1).default(15),
  DEPOSIT_MIN_CONFIRMATIONS_ETH: z.coerce.number().int().min(1).default(12),
  DEPOSIT_MIN_CONFIRMATIONS_TRON: z.coerce.number().int().min(1).default(20),

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
  // Crypto production readiness acknowledgement (Stage 5). EXORA ships INR_ONLY;
  // a real production deployment refuses to boot if any CRYPTO_*_GLOBAL_ENABLED
  // flag is true UNLESS this is explicitly set. Set to 'true' ONLY after a
  // documented crypto signer/custody/withdrawal-signing/compliance sign-off.
  // Never set in staging — staging keeps crypto globals OFF regardless.
  CRYPTO_PRODUCTION_READINESS_ACK: z
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
    // OTP_HASH_SECRET keys the HMAC over every email OTP, so a public dev
    // default would collapse OTP integrity to "DB access only". A REAL
    // production deployment must never boot with it. Staging (APP_ENV=staging)
    // runs the prod build but is allowed to keep the dev default like its other
    // offline/mock conveniences, so this guard is scoped to real production —
    // mirroring the prod-safety `realProduction` rule and avoiding a staging
    // boot regression (OTP_HASH_SECRET is not provisioned on staging).
    const realProduction = productionLike && val.APP_ENV !== 'staging';
    if (realProduction && DEV_ONLY_VALUES.has(val.OTP_HASH_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTP_HASH_SECRET'],
        message:
          'OTP_HASH_SECRET must not use a dev/default placeholder in production',
      });
    }
    if (val.MAIL_PROVIDER === 'ses' && !val.AWS_REGION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AWS_REGION'],
        message: 'AWS_REGION is required when MAIL_PROVIDER=ses',
      });
    }
    if (val.MAIL_PROVIDER === 'resend') {
      for (const key of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'] as const) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when MAIL_PROVIDER=resend`,
          });
        }
      }
    }
    if (val.KYC_STORAGE_PROVIDER === 's3') {
      if (!val.KYC_S3_BUCKET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['KYC_S3_BUCKET'],
          message: 'KYC_S3_BUCKET is required when KYC_STORAGE_PROVIDER=s3',
        });
      }
      if (!val.KYC_S3_REGION && !val.AWS_REGION) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['KYC_S3_REGION'],
          message: 'KYC_S3_REGION (or AWS_REGION) is required when KYC_STORAGE_PROVIDER=s3',
        });
      }
    }
    // Production-safety: refuse to boot with unsafe staging/demo toggles in
    // production unless each is explicitly acknowledged via its ALLOW_* override.
    for (const issue of productionSafetyIssues({
      nodeEnv: val.NODE_ENV,
      appEnv: val.APP_ENV,
      tronProvider: val.TRON_PROVIDER,
      bscProvider: val.BSC_PROVIDER,
      priceProvider: val.PRICE_PROVIDER,
      razorpayProvider: val.RAZORPAY_PROVIDER,
      kycProvider: val.KYC_PROVIDER,
      withdrawalSigner: val.WITHDRAWAL_SIGNER,
      mailProvider: val.MAIL_PROVIDER,
      requireEmailVerification: val.REQUIRE_EMAIL_VERIFICATION,
      allowUnverifiedLogin: val.ALLOW_UNVERIFIED_LOGIN,
      allowMockProviders: val.ALLOW_MOCK_PROVIDERS,
      allowMockWithdrawalSigner: val.ALLOW_MOCK_WITHDRAWAL_SIGNER,
      allowLogMailProvider: val.ALLOW_LOG_MAIL_PROVIDER,
      allowUnverifiedEmailLogin: val.ALLOW_UNVERIFIED_EMAIL_LOGIN,
      cryptoDepositsGlobalEnabled: val.CRYPTO_DEPOSITS_GLOBAL_ENABLED,
      cryptoWithdrawalsGlobalEnabled: val.CRYPTO_WITHDRAWALS_GLOBAL_ENABLED,
      cryptoWalletGlobalEnabled: val.CRYPTO_WALLET_GLOBAL_ENABLED,
      cryptoProductionReadinessAck: val.CRYPTO_PRODUCTION_READINESS_ACK,
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
