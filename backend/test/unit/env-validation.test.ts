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
});
