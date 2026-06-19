import { Prisma, type OrderSide } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface ReportDateFilter {
  fromDate?: Date;
  toDate?: Date;
}

function dateRange(input: ReportDateFilter): Prisma.DateTimeFilter | undefined {
  if (!input.fromDate && !input.toDate) return undefined;
  return {
    ...(input.fromDate ? { gte: input.fromDate } : {}),
    ...(input.toDate ? { lte: input.toDate } : {}),
  };
}

export interface TradeFeeRow {
  makerFee: Prisma.Decimal;
  takerFee: Prisma.Decimal;
  makerSide: OrderSide;
}

export interface WithdrawalFeeRow {
  asset: string;
  fee: Prisma.Decimal;
}

export interface LedgerFeeRevenueRow {
  asset: string;
  amount: Prisma.Decimal | null;
}

export const reportsRepository = {
  listTradesForFees(input: ReportDateFilter): Promise<TradeFeeRow[]> {
    return prisma.trade.findMany({
      where: { ...(dateRange(input) ? { executedAt: dateRange(input) } : {}) },
      select: { makerFee: true, takerFee: true, makerSide: true },
      orderBy: { executedAt: 'desc' },
    });
  },

  listCompletedWithdrawalsForFees(input: ReportDateFilter): Promise<WithdrawalFeeRow[]> {
    return prisma.cryptoWithdrawal.findMany({
      where: {
        status: 'COMPLETED',
        fee: { gt: new Prisma.Decimal(0) },
        ...(dateRange(input) ? { completedAt: dateRange(input) } : {}),
      },
      select: { asset: true, fee: true },
      orderBy: { completedAt: 'desc' },
    });
  },

  async feeRevenueLedgerByAsset(input: ReportDateFilter): Promise<LedgerFeeRevenueRow[]> {
    const rows = await prisma.ledgerEntry.groupBy({
      by: ['asset'],
      where: {
        direction: 'CREDIT',
        account: { kind: 'FEE_REVENUE' },
        ...(dateRange(input) ? { createdAt: dateRange(input) } : {}),
      },
      _sum: { amount: true },
    });
    return rows.map((row) => ({ asset: row.asset, amount: row._sum.amount }));
  },

  listMarketFeeSettings() {
    return prisma.market.findMany({
      select: {
        symbol: true,
        baseAsset: true,
        quoteAsset: true,
        makerFeeBps: true,
        takerFeeBps: true,
        status: true,
      },
      orderBy: { symbol: 'asc' },
    });
  },
};

export type ReportsRepository = typeof reportsRepository;
