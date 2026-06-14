import dotenv from 'dotenv';
import { z } from 'zod';

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
const envSchema = z.object({
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
  // DigiLocker provider selection. 'real' is intentionally not implemented yet.
  KYC_DIGILOCKER_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  // Default KYC tier granted on approval when the reviewer omits an explicit one.
  KYC_DEFAULT_APPROVED_TIER: z.coerce.number().int().min(1).max(5).default(1),

  // ---- INR DEPOSITS / RAZORPAY ----
  // Provider selection. 'mock' is a fully-offline deterministic stub used in dev
  // and tests; 'live' talks to the real Razorpay API and REQUIRES real keys.
  // The provider resolver refuses to boot in 'live' without key id + secret, so
  // we can never accidentally hit Razorpay with placeholder credentials.
  RAZORPAY_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  // Razorpay API key id ('rzp_test_...'/'rzp_live_...'). Optional in mock mode.
  RAZORPAY_KEY_ID: z.string().optional(),
  // Razorpay key secret — signs orders and verifies payment signatures. In mock
  // mode a deterministic dev default is used so tests can compute signatures.
  RAZORPAY_KEY_SECRET: z
    .string()
    .min(8, 'RAZORPAY_KEY_SECRET must be >= 8 chars')
    .default('dev-only-razorpay-key-secret-change-me'),
  // Razorpay webhook signing secret — verifies inbound webhook authenticity.
  RAZORPAY_WEBHOOK_SECRET: z
    .string()
    .min(8, 'RAZORPAY_WEBHOOK_SECRET must be >= 8 chars')
    .default('dev-only-razorpay-webhook-secret-change-me'),
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

  // ---- CRYPTO DEPOSIT SCANNER (TRON / TRC20 USDT) ----
  // Provider selection. 'mock' is fully offline/deterministic (dev + tests);
  // 'live' talks to TronGrid and REQUIRES an API key, so we never hammer the
  // real network with placeholder credentials.
  TRON_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  // TronGrid API key — required only in 'live' mode (resolver enforces).
  TRONGRID_API_KEY: z.string().optional(),
  TRONGRID_API_BASE: z.string().url().default('https://api.trongrid.io'),
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
  // Cooling-off before a newly-added withdrawal address can be used (ms).
  // Default 0 makes addresses usable immediately (dev/test); production sets >0.
  WITHDRAWAL_ADDRESS_COOLDOWN_MS: z.coerce.number().int().min(0).default(0),

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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // We cannot use the structured logger here — it depends on this config.
  // eslint-disable-next-line no-console
  console.error(
    '❌ Invalid environment configuration:\n',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

export type Env = typeof env;
