import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/reports/reports.repository', () => ({
  reportsRepository: {
    listTradesForFees: vi.fn(),
    listCompletedWithdrawalsForFees: vi.fn(),
    feeRevenueLedgerByAsset: vi.fn(),
    listMarketFeeSettings: vi.fn(),
  },
}));

import { reportsRepository } from '../../src/modules/reports/reports.repository';
import { reportsService } from '../../src/modules/reports/reports.service';

const repo = vi.mocked(reportsRepository);

describe('reportsService fee report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.listMarketFeeSettings.mockResolvedValue([
      {
        symbol: 'USDT-INR',
        baseAsset: 'USDT',
        quoteAsset: 'INR',
        makerFeeBps: 10,
        takerFeeBps: 20,
        status: 'ACTIVE',
      },
    ]);
  });

  it('summarizes real trading, withdrawal, and ledger fee revenue by asset', async () => {
    repo.listTradesForFees.mockResolvedValue([
      {
        makerSide: 'BUY',
        makerFee: new Prisma.Decimal('0.050000'),
        takerFee: new Prisma.Decimal('9.00'),
      },
      {
        makerSide: 'SELL',
        makerFee: new Prisma.Decimal('4.50'),
        takerFee: new Prisma.Decimal('0.100000'),
      },
    ]);
    repo.listCompletedWithdrawalsForFees.mockResolvedValue([
      { asset: 'USDT', fee: new Prisma.Decimal('1') },
      { asset: 'USDT', fee: new Prisma.Decimal('1.25') },
    ]);
    repo.feeRevenueLedgerByAsset.mockResolvedValue([
      { asset: 'INR', amount: new Prisma.Decimal('13.50') },
      { asset: 'USDT', amount: new Prisma.Decimal('2.40') },
    ]);

    const report = await reportsService.feeReport({});

    expect(report.tradingFees.totalByAsset).toEqual([
      { asset: 'INR', amount: '13.5' },
      { asset: 'USDT', amount: '0.15' },
    ]);
    expect(report.withdrawalFees.totalByAsset).toEqual([{ asset: 'USDT', amount: '2.25' }]);
    expect(report.ledgerFeeRevenue.totalByAsset).toEqual([
      { asset: 'INR', amount: '13.5' },
      { asset: 'USDT', amount: '2.4' },
    ]);
    expect(report.marketFees[0]).toMatchObject({ makerFeeBps: 10, takerFeeBps: 20 });
  });

  it('passes date filters through to every repository query', async () => {
    repo.listTradesForFees.mockResolvedValue([]);
    repo.listCompletedWithdrawalsForFees.mockResolvedValue([]);
    repo.feeRevenueLedgerByAsset.mockResolvedValue([]);
    const fromDate = new Date('2026-06-01T00:00:00.000Z');
    const toDate = new Date('2026-06-20T00:00:00.000Z');

    await reportsService.feeReport({ fromDate, toDate });

    expect(repo.listTradesForFees).toHaveBeenCalledWith({ fromDate, toDate });
    expect(repo.listCompletedWithdrawalsForFees).toHaveBeenCalledWith({ fromDate, toDate });
    expect(repo.feeRevenueLedgerByAsset).toHaveBeenCalledWith({ fromDate, toDate });
  });
});
