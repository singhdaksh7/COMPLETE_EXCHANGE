import { describe, it, expect } from 'vitest';
import {
  adminTotpRequired,
  productionSafetyIssues,
  type ProdSafetyInput,
} from '../../src/lib/prod-safety';

const safeProd: ProdSafetyInput = {
  nodeEnv: 'production',
  tronProvider: 'live',
  bscProvider: 'live',
  priceProvider: 'live',
  razorpayProvider: 'live',
  kycProvider: 'external',
  withdrawalSigner: 'live',
  mailProvider: 'ses',
  requireEmailVerification: true,
  allowUnverifiedLogin: false,
  allowMockProviders: false,
  allowMockWithdrawalSigner: false,
  allowLogMailProvider: false,
  allowUnverifiedEmailLogin: false,
  cryptoDepositsGlobalEnabled: false,
  cryptoWithdrawalsGlobalEnabled: false,
  cryptoWalletGlobalEnabled: false,
  cryptoProductionReadinessAck: false,
};

describe('productionSafetyIssues', () => {
  it('returns no issues for a fully-live production config', () => {
    expect(productionSafetyIssues(safeProd)).toEqual([]);
  });

  it('never flags anything outside production', () => {
    const stagingLikeButDev: ProdSafetyInput = {
      ...safeProd,
      nodeEnv: 'development',
      tronProvider: 'mock',
      withdrawalSigner: 'mock',
      mailProvider: 'log',
      requireEmailVerification: false,
    };
    expect(productionSafetyIssues(stagingLikeButDev)).toEqual([]);
  });

  it('flags every mock provider in production without the override', () => {
    const issues = productionSafetyIssues({
      ...safeProd,
      tronProvider: 'mock',
      bscProvider: 'mock',
      priceProvider: 'mock',
      razorpayProvider: 'mock',
      kycProvider: 'mock',
    });
    expect(issues.map((i) => i.path).sort()).toEqual([
      'BSC_PROVIDER',
      'KYC_PROVIDER',
      'PRICE_PROVIDER',
      'RAZORPAY_PROVIDER',
      'TRON_PROVIDER',
    ]);
    expect(issues[0].message).toMatch(/ALLOW_MOCK_PROVIDERS/);
  });

  it('allows mock providers in production WITH the explicit override', () => {
    const issues = productionSafetyIssues({
      ...safeProd,
      tronProvider: 'mock',
      bscProvider: 'mock',
      kycProvider: 'mock',
      allowMockProviders: true,
    });
    expect(issues).toEqual([]);
  });

  it('flags the mock withdrawal signer unless explicitly allowed', () => {
    expect(
      productionSafetyIssues({ ...safeProd, withdrawalSigner: 'mock' }).map((i) => i.path),
    ).toEqual(['WITHDRAWAL_SIGNER']);
    expect(
      productionSafetyIssues({
        ...safeProd,
        withdrawalSigner: 'mock',
        allowMockWithdrawalSigner: true,
      }),
    ).toEqual([]);
  });

  it('flags the log mail provider unless explicitly allowed', () => {
    expect(
      productionSafetyIssues({ ...safeProd, mailProvider: 'log' }).map((i) => i.path),
    ).toEqual(['MAIL_PROVIDER']);
    expect(
      productionSafetyIssues({ ...safeProd, mailProvider: 'log', allowLogMailProvider: true }),
    ).toEqual([]);
  });

  it('flags disabled email verification unless explicitly allowed', () => {
    expect(
      productionSafetyIssues({ ...safeProd, requireEmailVerification: false }).map((i) => i.path),
    ).toEqual(['REQUIRE_EMAIL_VERIFICATION']);
    expect(
      productionSafetyIssues({
        ...safeProd,
        requireEmailVerification: false,
        allowUnverifiedEmailLogin: true,
      }),
    ).toEqual([]);
  });

  it('flags the Stage 13 ALLOW_UNVERIFIED_LOGIN bypass with no override', () => {
    expect(
      productionSafetyIssues({ ...safeProd, allowUnverifiedLogin: true }).map((i) => i.path),
    ).toEqual(['ALLOW_UNVERIFIED_LOGIN']);
  });

  it('flags ALLOW_UNVERIFIED_LOGIN in real production (APP_ENV=production)', () => {
    expect(
      productionSafetyIssues({
        ...safeProd,
        appEnv: 'production',
        allowUnverifiedLogin: true,
      }).map((i) => i.path),
    ).toEqual(['ALLOW_UNVERIFIED_LOGIN']);
  });

  it('flags ALLOW_UNVERIFIED_LOGIN in real production (APP_ENV unset)', () => {
    expect(
      productionSafetyIssues({
        ...safeProd,
        appEnv: undefined,
        nodeEnv: 'production',
        allowUnverifiedLogin: true,
      }).map((i) => i.path),
    ).toEqual(['ALLOW_UNVERIFIED_LOGIN']);
  });

  it('allows ALLOW_UNVERIFIED_LOGIN on staging (NODE_ENV=production, APP_ENV=staging)', () => {
    expect(
      productionSafetyIssues({
        ...safeProd,
        nodeEnv: 'production',
        appEnv: 'staging',
        allowUnverifiedLogin: true,
      }),
    ).toEqual([]);
  });

  it('flags each crypto global enabled in real production without the ack', () => {
    const issues = productionSafetyIssues({
      ...safeProd,
      appEnv: 'production',
      cryptoDepositsGlobalEnabled: true,
      cryptoWithdrawalsGlobalEnabled: true,
      cryptoWalletGlobalEnabled: true,
    });
    expect(issues.map((i) => i.path).sort()).toEqual([
      'CRYPTO_DEPOSITS_GLOBAL_ENABLED',
      'CRYPTO_WALLET_GLOBAL_ENABLED',
      'CRYPTO_WITHDRAWALS_GLOBAL_ENABLED',
    ]);
    expect(issues[0].message).toMatch(/CRYPTO_PRODUCTION_READINESS_ACK/);
  });

  it('allows crypto globals in production ONLY with the explicit readiness ack', () => {
    expect(
      productionSafetyIssues({
        ...safeProd,
        appEnv: 'production',
        cryptoWithdrawalsGlobalEnabled: true,
        cryptoProductionReadinessAck: true,
      }),
    ).toEqual([]);
  });

  it('never flags crypto globals on staging (APP_ENV=staging), regardless of ack', () => {
    expect(
      productionSafetyIssues({
        ...safeProd,
        nodeEnv: 'production',
        appEnv: 'staging',
        cryptoDepositsGlobalEnabled: true,
        cryptoWalletGlobalEnabled: true,
      }),
    ).toEqual([]);
  });
});

describe('adminTotpRequired', () => {
  it('requires TOTP for a TOTP-less admin in production without the override', () => {
    expect(adminTotpRequired({ isProd: true, totpEnabled: false, allowOverride: false })).toBe(true);
  });

  it('does not require it when the admin has TOTP enabled', () => {
    expect(adminTotpRequired({ isProd: true, totpEnabled: true, allowOverride: false })).toBe(false);
  });

  it('does not require it outside production (staging/dev self-enrollment)', () => {
    expect(adminTotpRequired({ isProd: false, totpEnabled: false, allowOverride: false })).toBe(false);
  });

  it('is waived by the explicit staging override', () => {
    expect(adminTotpRequired({ isProd: true, totpEnabled: false, allowOverride: true })).toBe(false);
  });
});
