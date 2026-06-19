import { Prisma, type MarketStatus, type OrderSide } from '@prisma/client';
import { config } from '../../config';
import { BASE_ASSET, QUOTE_ASSET } from '../trading/trading.types';
import { reportsRepository, type ReportDateFilter } from './reports.repository';

interface AssetFeeTotal {
  asset: string;
  amount: string;
}

interface MarketFeeSetting {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  makerFeeBps: number;
  takerFeeBps: number;
  status: MarketStatus;
}

export interface FeeReportDto {
  fromDate: Date | null;
  toDate: Date | null;
  tradingFees: {
    totalByAsset: AssetFeeTotal[];
  };
  withdrawalFees: {
    totalByAsset: AssetFeeTotal[];
    flatFeeUsdt: string;
  };
  ledgerFeeRevenue: {
    totalByAsset: AssetFeeTotal[];
  };
  marketFees: MarketFeeSetting[];
}

function addAmount(map: Map<string, Prisma.Decimal>, asset: string, amount: Prisma.Decimal) {
  if (amount.lte(0)) return;
  map.set(asset, (map.get(asset) ?? new Prisma.Decimal(0)).add(amount));
}

function totals(map: Map<string, Prisma.Decimal>): AssetFeeTotal[] {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([asset, amount]) => ({ asset, amount: amount.toFixed() }));
}

function feeAssetForSide(side: OrderSide): string {
  return side === 'BUY' ? BASE_ASSET : QUOTE_ASSET;
}

function opposite(side: OrderSide): OrderSide {
  return side === 'BUY' ? 'SELL' : 'BUY';
}

export const reportsService = {
  async feeReport(input: ReportDateFilter): Promise<FeeReportDto> {
    const [trades, withdrawals, ledgerRevenue, marketFees] = await Promise.all([
      reportsRepository.listTradesForFees(input),
      reportsRepository.listCompletedWithdrawalsForFees(input),
      reportsRepository.feeRevenueLedgerByAsset(input),
      reportsRepository.listMarketFeeSettings(),
    ]);

    const trading = new Map<string, Prisma.Decimal>();
    for (const trade of trades) {
      addAmount(trading, feeAssetForSide(trade.makerSide), trade.makerFee);
      addAmount(trading, feeAssetForSide(opposite(trade.makerSide)), trade.takerFee);
    }

    const withdrawal = new Map<string, Prisma.Decimal>();
    for (const row of withdrawals) addAmount(withdrawal, row.asset, row.fee);

    const ledger = new Map<string, Prisma.Decimal>();
    for (const row of ledgerRevenue) {
      if (row.amount) addAmount(ledger, row.asset, row.amount);
    }

    return {
      fromDate: input.fromDate ?? null,
      toDate: input.toDate ?? null,
      tradingFees: { totalByAsset: totals(trading) },
      withdrawalFees: {
        totalByAsset: totals(withdrawal),
        flatFeeUsdt: config.withdrawal.feeUsdt,
      },
      ledgerFeeRevenue: { totalByAsset: totals(ledger) },
      marketFees,
    };
  },
};

export type ReportsService = typeof reportsService;
