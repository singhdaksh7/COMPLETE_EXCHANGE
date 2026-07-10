import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/modules/deposit/deposit.repository', () => ({
  depositRepository: {
    findUserKyc: vi.fn(),
    createDeposit: vi.fn(),
    findDepositById: vi.fn(),
    findDepositByOrderId: vi.fn(),
    attachPayment: vi.fn(),
    markCredited: vi.fn(),
    markFailed: vi.fn(),
    listUserDeposits: vi.fn(),
    adminListDeposits: vi.fn(),
    recordWebhookEvent: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/modules/ledger/ledger.service', () => ({
  ledgerService: { post: vi.fn() },
}));

vi.mock('../../src/modules/feature-controls/feature-controls.service', () => ({
  featureControlsService: {
    getEffectiveAccessControls: vi.fn(),
  },
}));

import { depositService } from '../../src/modules/deposit/deposit.service';
import { featureControlsService } from '../../src/modules/feature-controls/feature-controls.service';
import { config } from '../../src/config';

const features = vi.mocked(featureControlsService);

const USER_ID = '11111111-1111-4111-8111-111111111111';

const ALL_ON = {
  canTradeSpot: true,
  canPlaceBuyOrders: true,
  canPlaceSellOrders: true,
  canCancelOrders: true,
  canDepositInr: true,
  canWithdrawInr: true,
  canDepositCrypto: false,
  canWithdrawCrypto: false,
  canAccessCryptoWallet: false,
  forceKycReview: false,
  requireEnhancedKyc: false,
  underComplianceReview: false,
  blockHighRiskActivity: false,
  manualReviewBeforeWithdrawal: false,
} as const;

describe('depositService.getInstructions (Stage 10A + 10B verification gate)', () => {
  const originalVerified = config.inrDepositInstructions.verified;

  afterEach(() => {
    config.inrDepositInstructions.verified = originalVerified;
  });

  it('returns enabled:false, reason FEATURE_DISABLED, and no bank/UPI fields when canDepositInr is effectively false', async () => {
    features.getEffectiveAccessControls.mockResolvedValue({
      ...ALL_ON,
      canDepositInr: false,
    });

    const result = await depositService.getInstructions(USER_ID);

    expect(result).toEqual({ enabled: false, reason: 'FEATURE_DISABLED' });
    expect(Object.keys(result)).not.toContain('accountNumber');
    expect(Object.keys(result)).not.toContain('ifsc');
    expect(Object.keys(result)).not.toContain('upiId');
  });

  it('returns enabled:false, reason UNAVAILABLE, and no bank/UPI fields when deposits are enabled but instructions are not operator-verified', async () => {
    config.inrDepositInstructions.verified = false;
    features.getEffectiveAccessControls.mockResolvedValue({ ...ALL_ON });

    const result = await depositService.getInstructions(USER_ID);

    expect(result).toEqual({ enabled: false, reason: 'UNAVAILABLE' });
    expect(Object.keys(result)).not.toContain('accountNumber');
    expect(Object.keys(result)).not.toContain('ifsc');
    expect(Object.keys(result)).not.toContain('upiId');
  });

  it('returns the configured transfer instructions when canDepositInr is effectively true AND instructions are operator-verified', async () => {
    config.inrDepositInstructions.verified = true;
    features.getEffectiveAccessControls.mockResolvedValue({ ...ALL_ON });

    const result = await depositService.getInstructions(USER_ID);

    expect(result.enabled).toBe(true);
    if (!result.enabled) throw new Error('unreachable');
    expect(result.method).toBe('BANK_TRANSFER');
    expect(result.bankName).toBe(config.inrDepositInstructions.bankName);
    expect(result.beneficiaryName).toBe(config.inrDepositInstructions.beneficiaryName);
    expect(result.accountNumber).toBe(config.inrDepositInstructions.accountNumber);
    expect(result.ifsc).toBe(config.inrDepositInstructions.ifsc);
    expect(result.accountType).toBe(config.inrDepositInstructions.accountType);
    expect(result.upiId).toBe(config.inrDepositInstructions.upiId);
    expect(result.referenceRequired).toBe(true);
    expect(typeof result.instructions).toBe('string');
  });

  it('never leaks internal/sensitive fields — response is limited to the customer-safe DTO shape', async () => {
    config.inrDepositInstructions.verified = true;
    features.getEffectiveAccessControls.mockResolvedValue({ ...ALL_ON });

    const result = await depositService.getInstructions(USER_ID);

    const allowedKeys = new Set([
      'enabled',
      'method',
      'bankName',
      'beneficiaryName',
      'accountNumber',
      'ifsc',
      'accountType',
      'upiId',
      'referenceRequired',
      'instructions',
    ]);
    for (const key of Object.keys(result)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });

  it('checks effective access (global AND per-user), not a raw global-only flag', async () => {
    features.getEffectiveAccessControls.mockResolvedValue({
      ...ALL_ON,
      canDepositInr: false,
    });

    await depositService.getInstructions(USER_ID);

    expect(features.getEffectiveAccessControls).toHaveBeenCalledWith(USER_ID);
  });
});
