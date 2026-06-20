import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../src/config/env';

const baseEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://cex:secret@db.example.com:5432/cex',
  REDIS_URL: 'redis://redis.example.com:6379',
  JWT_ACCESS_SECRET: 'prod_access_secret_48_chars_minimum_value_123456',
  JWT_REFRESH_SECRET: 'prod_refresh_secret_48_chars_minimum_value_123456',
  CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
  KYC_ENCRYPTION_KEY: 'prod_kyc_encryption_secret_32_chars_value',
  KYC_WEBHOOK_SECRET: 'prod_kyc_webhook_secret_value',
  RAZORPAY_KEY_SECRET: 'prod_razorpay_secret_value',
  RAZORPAY_WEBHOOK_SECRET: 'prod_razorpay_webhook_secret',
  // baseEnv runs NODE_ENV=production on the default (mock/log) providers, so it
  // must acknowledge them via the Stage 4.2 overrides to be a valid config.
  ALLOW_MOCK_PROVIDERS: 'true',
  ALLOW_MOCK_WITHDRAWAL_SIGNER: 'true',
  ALLOW_LOG_MAIL_PROVIDER: 'true',
} satisfies Record<string, string>;

describe('env validation', () => {
  it('accepts a production-like valid config', () => {
    const env = validateEnv(baseEnv);
    expect(env.NODE_ENV).toBe('production');
    expect(env.CORS_ORIGINS).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('rejects missing critical vars', () => {
    const env = { ...baseEnv };
    delete (env as Partial<typeof env>).DATABASE_URL;

    expect(() => validateEnv(env)).toThrow();
  });

  it('rejects dev placeholders in production', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        JWT_ACCESS_SECRET: 'change_me_access_secret_min_32_chars_long_value',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('requires live provider dependencies only when enabled', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        MAIL_PROVIDER: 'ses',
        AWS_REGION: '',
      }),
    ).toThrow(/AWS_REGION/);

    expect(() =>
      validateEnv({
        ...baseEnv,
        TRON_PROVIDER: 'live',
        TRONGRID_API_KEY: '',
      }),
    ).toThrow(/TRONGRID_API_KEY/);
  });

  // Staging runs NODE_ENV=production with mock/offline services. That is only
  // accepted when every unsafe toggle is explicitly acknowledged via ALLOW_*.
  const stagingOverrides = {
    ALLOW_MOCK_PROVIDERS: 'true',
    ALLOW_MOCK_WITHDRAWAL_SIGNER: 'true',
    ALLOW_LOG_MAIL_PROVIDER: 'true',
  } satisfies Record<string, string>;

  it('accepts a staging-style production config when overrides acknowledge mocks', () => {
    const env = validateEnv({
      ...baseEnv,
      ...stagingOverrides,
      CORS_ORIGINS: ' https://app.example.com , https://admin.example.com ',
      MAIL_PROVIDER: 'log',
      AWS_REGION: '',
      SES_CONFIGURATION_SET: '',
      GOOGLE_OAUTH_ENABLED: 'false',
      TRON_PROVIDER: 'mock',
      TRONGRID_API_KEY: '',
      BSC_PROVIDER: 'mock',
      BSC_TESTNET_RPC_URL: '',
      RAZORPAY_PROVIDER: 'mock',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
      WITHDRAWAL_SIGNER: 'mock',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.MAIL_PROVIDER).toBe('log');
    expect(env.TRON_PROVIDER).toBe('mock');
    expect(env.ALLOW_MOCK_PROVIDERS).toBe(true);
    expect(env.ALLOW_ADMIN_LOGIN_WITHOUT_TOTP).toBe(false); // default off
  });

  it('REJECTS mock providers in production without ALLOW_MOCK_PROVIDERS', () => {
    expect(() =>
      validateEnv({ ...baseEnv, ALLOW_MOCK_PROVIDERS: 'false', TRON_PROVIDER: 'mock' }),
    ).toThrow(/ALLOW_MOCK_PROVIDERS/);
  });

  it('REJECTS the mock withdrawal signer in production without ALLOW_MOCK_WITHDRAWAL_SIGNER', () => {
    expect(() =>
      validateEnv({ ...baseEnv, ...stagingOverrides, ALLOW_MOCK_WITHDRAWAL_SIGNER: 'false', WITHDRAWAL_SIGNER: 'mock' }),
    ).toThrow(/ALLOW_MOCK_WITHDRAWAL_SIGNER/);
  });

  it('REJECTS the log mail provider in production without ALLOW_LOG_MAIL_PROVIDER', () => {
    expect(() =>
      validateEnv({ ...baseEnv, ...stagingOverrides, ALLOW_LOG_MAIL_PROVIDER: 'false', MAIL_PROVIDER: 'log' }),
    ).toThrow(/ALLOW_LOG_MAIL_PROVIDER|MAIL_PROVIDER/);
  });

  it('REJECTS disabled email verification in production without the override', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        // Use a fully-live posture so only the email-verification guard can fire.
        MAIL_PROVIDER: 'ses',
        AWS_REGION: 'ap-south-1',
        TRON_PROVIDER: 'live',
        TRONGRID_API_KEY: 'real-key',
        BSC_PROVIDER: 'live',
        BSC_TESTNET_RPC_URL: 'https://bsc.example.com',
        PRICE_PROVIDER: 'live',
        RAZORPAY_PROVIDER: 'live',
        RAZORPAY_KEY_ID: 'rzp_live_x',
        KYC_PROVIDER: 'external',
        WITHDRAWAL_SIGNER: 'mock',
        ALLOW_MOCK_WITHDRAWAL_SIGNER: 'true',
        REQUIRE_EMAIL_VERIFICATION: 'false',
      }),
    ).toThrow(/REQUIRE_EMAIL_VERIFICATION|ALLOW_UNVERIFIED_EMAIL_LOGIN/);
  });

  it('does not apply production guards in a dev/staging non-production NODE_ENV', () => {
    const env = validateEnv({
      ...baseEnv,
      NODE_ENV: 'development',
      TRON_PROVIDER: 'mock',
      WITHDRAWAL_SIGNER: 'mock',
      MAIL_PROVIDER: 'log',
    });
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects invalid live provider config only when that provider is enabled', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        RAZORPAY_PROVIDER: 'mock',
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        RAZORPAY_WEBHOOK_SECRET: '',
      }),
    ).not.toThrow();

    expect(() =>
      validateEnv({
        ...baseEnv,
        RAZORPAY_PROVIDER: 'live',
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: 'dev-only-razorpay-key-secret-change-me',
        RAZORPAY_WEBHOOK_SECRET: 'dev-only-razorpay-webhook-secret-change-me',
      }),
    ).toThrow(/RAZORPAY_KEY_ID|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET/);

    expect(() =>
      validateEnv({
        ...baseEnv,
        GOOGLE_OAUTH_ENABLED: 'true',
        GOOGLE_CLIENT_ID: '',
      }),
    ).toThrow(/GOOGLE_CLIENT_ID/);
  });
});
