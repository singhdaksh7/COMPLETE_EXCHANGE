import {
  Prisma,
  type Conversion,
  type ConversionSide,
  type PriceQuote,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository layer: the ONLY place that talks to Prisma for conversions
 * (price_quotes, conversions, treasury-liquidity reads). The schema is frozen.
 * This layer NEVER moves balances — settlement goes through LedgerService — it
 * only persists quote/conversion state and reads system-account balances.
 */
export const conversionRepository = {
  findUserKyc(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, kycStatus: true, kycTier: true },
    });
  },

  createQuote(data: {
    userId: string;
    side: ConversionSide;
    rate: Prisma.Decimal;
    spreadBps: number;
    expiresAt: Date;
  }): Promise<PriceQuote> {
    return prisma.priceQuote.create({ data });
  },

  findQuoteById(id: string): Promise<PriceQuote | null> {
    return prisma.priceQuote.findUnique({ where: { id } });
  },

  /** Single-use guard: an existing conversion for a quote blocks re-conversion. */
  findConversionByQuoteId(quoteId: string): Promise<Conversion | null> {
    return prisma.conversion.findFirst({ where: { quoteId } });
  },

  createConversion(data: {
    userId: string;
    quoteId: string;
    side: ConversionSide;
    inrAmount: Prisma.Decimal;
    usdtAmount: Prisma.Decimal;
    rate: Prisma.Decimal;
    feeInr: Prisma.Decimal;
    tdsAmount: Prisma.Decimal;
    ledgerTxnId: string;
  }): Promise<Conversion> {
    return prisma.conversion.create({ data });
  },

  listUserConversions(input: {
    userId: string;
    side?: ConversionSide;
    cursor?: string;
    limit: number;
  }): Promise<Conversion[]> {
    return prisma.conversion.findMany({
      where: {
        userId: input.userId,
        ...(input.side ? { side: input.side } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  adminListConversions(input: {
    side?: ConversionSide;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<Conversion[]> {
    return prisma.conversion.findMany({
      where: {
        ...(input.side ? { side: input.side } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  /**
   * Treasury liquidity: the balance of a system account (userId IS NULL) for an
   * asset, e.g. the platform's LIQUIDITY USDT/INR holdings. Returns 0 when the
   * account does not exist yet.
   */
  async systemAccountBalance(
    kind: 'LIQUIDITY' | 'FEE_REVENUE' | 'TDS_PAYABLE',
    asset: string,
  ): Promise<Prisma.Decimal> {
    const account = await prisma.account.findFirst({
      where: { kind, userId: null, asset },
      include: { balance: true },
    });
    return account?.balance?.balance ?? new Prisma.Decimal(0);
  },

  writeAdminLog(data: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    ip?: string;
    requestId?: string;
    afterState?: Prisma.InputJsonValue;
  }) {
    return prisma.adminLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        ip: data.ip,
        requestId: data.requestId,
        afterState: data.afterState,
      },
    });
  },
};

export type ConversionRepository = typeof conversionRepository;
