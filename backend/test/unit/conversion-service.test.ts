import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../src/modules/conversion/conversion.repository', () => ({
  conversionRepository: {
    findUserKyc: vi.fn(),
    createQuote: vi.fn(),
    findQuoteById: vi.fn(),
    findConversionByQuoteId: vi.fn(),
    createConversion: vi.fn(),
    listUserConversions: vi.fn(),
    adminListConversions: vi.fn(),
    systemAccountBalance: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/modules/ledger/ledger.service', () => ({
  ledgerService: { post: vi.fn() },
}));

vi.mock('../../src/lib/redis', () => ({
  authRedisSet: vi.fn().mockResolvedValue('OK'),
  authRedisGet: vi.fn(),
  authRedisGetDel: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { conversionRepository } from '../../src/modules/conversion/conversion.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { authRedisGet } from '../../src/lib/redis';
import { conversionService } from '../../src/modules/conversion/conversion.service';
import type { ConversionPlan } from '../../src/modules/conversion/conversion.types';

const repo = vi.mocked(conversionRepository);
const ledger = vi.mocked(ledgerService);
const redisGet = vi.mocked(authRedisGet);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const QUOTE_ID = '22222222-2222-4222-8222-222222222222';

const buyPlan: ConversionPlan = {
  side: 'INR_TO_USDT',
  rate: '90.45',
  inrAmount: '900.00',
  usdtAmount: '9.930348',
  feeInr: '1.80',
  tdsAmount: '0.00',
  grossInr: '900.00',
  liquidityAsset: 'USDT',
  liquidityNeed: '9.930348',
};

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: QUOTE_ID,
    userId: USER_ID,
    side: 'INR_TO_USDT',
    rate: new Prisma.Decimal('90.45'),
    spreadBps: 50,
    expiresAt: new Date(Date.now() + 30_000),
    createdAt: new Date(),
    ...overrides,
  } as never;
}

function snapshot(plan: ConversionPlan): string {
  return JSON.stringify({ quoteId: QUOTE_ID, userId: USER_ID, plan });
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findUserKyc.mockResolvedValue({ id: USER_ID, status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1 } as never);
  ledger.post.mockResolvedValue({ id: 'ltxn-1', kind: 'CONVERSION', entries: [] } as never);
  repo.systemAccountBalance.mockResolvedValue(new Prisma.Decimal('100000'));
});

describe('createQuote', () => {
  it('requires approved KYC', async () => {
    repo.findUserKyc.mockResolvedValue({ id: USER_ID, status: 'ACTIVE', kycStatus: 'PENDING', kycTier: 0 } as never);
    await expect(
      conversionService.createQuote(USER_ID, { side: 'INR_TO_USDT', amount: '900' }),
    ).rejects.toMatchObject({ errorCode: 'KYC_REQUIRED' });
  });

  it('creates a quote, stores the snapshot, and returns the breakdown', async () => {
    repo.createQuote.mockResolvedValue(quoteRow());
    const { authRedisSet } = await import('../../src/lib/redis');

    const dto = await conversionService.createQuote(USER_ID, { side: 'INR_TO_USDT', amount: '900' });

    expect(dto.rate).toBe('90.45'); // 90.00 mid + 50bps spread
    expect(dto.inrAmount).toBe('900.00');
    expect(dto.feeInr).toBe('1.80');
    expect(dto.usdtAmount).toBe('9.930348');
    expect(vi.mocked(authRedisSet)).toHaveBeenCalled();
  });
});

describe('executeConversion', () => {
  it('rejects an expired quote without touching the ledger', async () => {
    repo.findQuoteById.mockResolvedValue(quoteRow({ expiresAt: new Date(Date.now() - 1000) }));
    repo.findConversionByQuoteId.mockResolvedValue(null);
    await expect(
      conversionService.executeConversion(USER_ID, QUOTE_ID),
    ).rejects.toMatchObject({ errorCode: 'QUOTE_EXPIRED' });
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('is idempotent: an already-converted quote returns the existing conversion', async () => {
    repo.findQuoteById.mockResolvedValue(quoteRow());
    repo.findConversionByQuoteId.mockResolvedValue({
      id: 'cv-1',
      side: 'INR_TO_USDT',
      inrAmount: new Prisma.Decimal('900.00'),
      usdtAmount: new Prisma.Decimal('9.930348'),
      rate: new Prisma.Decimal('90.45'),
      feeInr: new Prisma.Decimal('1.80'),
      tdsAmount: new Prisma.Decimal('0'),
      createdAt: new Date(),
    } as never);

    const dto = await conversionService.executeConversion(USER_ID, QUOTE_ID);
    expect(dto.id).toBe('cv-1');
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('rejects when treasury liquidity is insufficient', async () => {
    repo.findQuoteById.mockResolvedValue(quoteRow());
    repo.findConversionByQuoteId.mockResolvedValue(null);
    redisGet.mockResolvedValue(snapshot(buyPlan));
    repo.systemAccountBalance.mockResolvedValue(new Prisma.Decimal('1')); // < 9.93 USDT
    await expect(
      conversionService.executeConversion(USER_ID, QUOTE_ID),
    ).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_LIQUIDITY' });
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('settles INR_TO_USDT with a balanced double-entry posting', async () => {
    repo.findQuoteById.mockResolvedValue(quoteRow());
    repo.findConversionByQuoteId.mockResolvedValue(null);
    redisGet.mockResolvedValue(snapshot(buyPlan));
    repo.createConversion.mockResolvedValue({
      id: 'cv-2',
      side: 'INR_TO_USDT',
      inrAmount: new Prisma.Decimal('900.00'),
      usdtAmount: new Prisma.Decimal('9.930348'),
      rate: new Prisma.Decimal('90.45'),
      feeInr: new Prisma.Decimal('1.80'),
      tdsAmount: new Prisma.Decimal('0'),
      createdAt: new Date(),
    } as never);

    const dto = await conversionService.executeConversion(USER_ID, QUOTE_ID);
    expect(dto.id).toBe('cv-2');

    const posting = ledger.post.mock.calls[0][0];
    expect(posting.kind).toBe('CONVERSION');
    expect(posting.referenceType).toBe('conversion');
    expect(posting.referenceId).toBe(QUOTE_ID); // idempotency anchor
    // INR leg balances (900 debit = 898.20 + 1.80 credit); USDT leg balances.
    assertBalanced(posting.lines);
  });
});

describe('buildLines', () => {
  it('produces per-asset balanced legs for INR_TO_USDT', () => {
    assertBalanced(conversionService.buildLines(USER_ID, buyPlan));
  });

  it('produces per-asset balanced legs for USDT_TO_INR (with fee + TDS)', () => {
    const sellPlan: ConversionPlan = {
      side: 'USDT_TO_INR',
      rate: '89.55',
      inrAmount: '884.76',
      usdtAmount: '10.000000',
      feeInr: '1.79',
      tdsAmount: '8.95',
      grossInr: '895.50',
      liquidityAsset: 'INR',
      liquidityNeed: '895.50',
    };
    const lines = conversionService.buildLines(USER_ID, sellPlan);
    assertBalanced(lines);
    // TDS placeholder is posted to TDS_PAYABLE.
    expect(lines.some((l) => l.kind === 'TDS_PAYABLE' && l.amount === '8.95')).toBe(true);
  });
});

function assertBalanced(lines: Array<{ asset: string; direction: string; amount: string }>): void {
  const totals = new Map<string, number>();
  for (const l of lines) {
    const sign = l.direction === 'CREDIT' ? 1 : -1;
    totals.set(l.asset, (totals.get(l.asset) ?? 0) + sign * Number(l.amount));
  }
  for (const [, total] of totals) {
    expect(Math.abs(total)).toBeLessThan(1e-6);
  }
}
