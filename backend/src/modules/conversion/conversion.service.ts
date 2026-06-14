import { Prisma, type Conversion, type ConversionSide } from '@prisma/client';
import { config } from '../../config';
import { AppError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { authRedisGet, authRedisGetDel, authRedisSet } from '../../lib/redis';
import { ledgerService } from '../ledger/ledger.service';
import { conversionRepository } from './conversion.repository';
import { getPriceProvider } from './providers';
import {
  ConversionAction,
  INR,
  LEDGER_KIND,
  REFERENCE_TYPE,
  USDT,
  applySpread,
  computePlan,
  toConversionDto,
  toQuoteDto,
} from './conversion.types';
import type {
  ConversionContext,
  ConversionDto,
  ConversionPlan,
  QuoteDto,
  QuoteSnapshot,
} from './conversion.types';
import type { LedgerPostingLine } from '../ledger/ledger.types';

const snapshotKey = (quoteId: string): string => `conversion:quote:${quoteId}`;

/** Retry an idempotent ledger posting on a SERIALIZABLE write-conflict (P2034). */
async function postWithRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 15 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export const conversionService = {
  // ==================================================================
  // 1 + 5. Quote creation (mock price + platform spread/fee/TDS preview)
  // ==================================================================
  async createQuote(
    userId: string,
    input: { side: ConversionSide; amount: string },
    ctx: ConversionContext = {},
  ): Promise<QuoteDto> {
    await this.assertKycApproved(userId);

    const provider = getPriceProvider();
    const mid = await provider.getMidPrice({ base: USDT, quote: INR });
    const rate = applySpread(mid.price, input.side, config.conversion.spreadBps);

    const plan = computePlan({
      side: input.side,
      amount: input.amount,
      rate,
      feeBps: config.conversion.feeBps,
      tdsBps: config.conversion.tdsBps,
    });
    if (dec(plan.usdtAmount).lte(0) || dec(plan.inrAmount).lte(0)) {
      throw new AppError('Amount is too small to convert', 422, 'AMOUNT_TOO_SMALL');
    }

    const ttlMs = config.conversion.quoteTtlMs;
    const quote = await conversionRepository.createQuote({
      userId,
      side: input.side,
      rate: dec(rate),
      spreadBps: config.conversion.spreadBps,
      expiresAt: new Date(Date.now() + ttlMs),
    });

    // Bind the amount + economics to the stored quote via a short-lived snapshot
    // (the frozen PriceQuote has no amount column). Expiry is enforced both by
    // this TTL and by the DB `expiresAt`.
    const snapshot: QuoteSnapshot = { quoteId: quote.id, userId, plan };
    await authRedisSet(snapshotKey(quote.id), JSON.stringify(snapshot), 'PX', ttlMs);

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: ConversionAction.QUOTE_CREATED,
      entityType: 'price_quote',
      entityId: quote.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { side: input.side, rate, mid: mid.price, amount: input.amount },
    });

    return toQuoteDto(quote, plan);
  },

  // ==================================================================
  // 3 + 4 + 8. Execute a conversion against a valid quote (atomic settle)
  // ==================================================================
  async executeConversion(
    userId: string,
    quoteId: string,
    ctx: ConversionContext = {},
  ): Promise<ConversionDto> {
    await this.assertKycApproved(userId);

    const quote = await conversionRepository.findQuoteById(quoteId);
    if (!quote || quote.userId !== userId) {
      throw new NotFoundError('Quote not found', 'QUOTE_NOT_FOUND');
    }

    // 11. Single-use / idempotent: a quote already converted returns the same
    // result rather than converting twice.
    const existing = await conversionRepository.findConversionByQuoteId(quoteId);
    if (existing) return toConversionDto(existing);

    // 2. Reject expired quotes (DB is authoritative).
    if (quote.expiresAt <= new Date()) {
      await this.auditExpiry(userId, quoteId, ctx);
      throw new AppError('Quote has expired', 422, 'QUOTE_EXPIRED');
    }

    // The amount-bound snapshot must still exist (TTL not elapsed / not consumed).
    const raw = await authRedisGet(snapshotKey(quoteId));
    if (!raw) {
      await this.auditExpiry(userId, quoteId, ctx);
      throw new AppError('Quote has expired', 422, 'QUOTE_EXPIRED');
    }
    const snapshot = JSON.parse(raw) as QuoteSnapshot;
    if (snapshot.userId !== userId) {
      throw new NotFoundError('Quote not found', 'QUOTE_NOT_FOUND');
    }
    const plan = snapshot.plan;

    // 7. Treasury liquidity check (platform-liquidity model). System accounts can
    // go negative in the ledger, so this MUST be checked explicitly here.
    const liquidity = await conversionRepository.systemAccountBalance(
      'LIQUIDITY',
      plan.liquidityAsset,
    );
    if (liquidity.lt(dec(plan.liquidityNeed))) {
      throw new AppError(
        'Insufficient treasury liquidity for this conversion',
        503,
        'INSUFFICIENT_LIQUIDITY',
      );
    }

    // 8. Atomic double-entry settlement (idempotent on referenceId = quoteId).
    const posted = await postWithRetry(() =>
      ledgerService.post(
        {
          kind: LEDGER_KIND,
          referenceType: REFERENCE_TYPE,
          referenceId: quoteId,
          metadata: { side: plan.side, rate: plan.rate },
          lines: this.buildLines(userId, plan),
        },
        { userId },
      ),
    );

    const conversion = await conversionRepository.createConversion({
      userId,
      quoteId,
      side: plan.side,
      inrAmount: dec(plan.inrAmount),
      usdtAmount: dec(plan.usdtAmount),
      rate: dec(plan.rate),
      feeInr: dec(plan.feeInr),
      tdsAmount: dec(plan.tdsAmount),
      ledgerTxnId: posted.id,
    });

    // Consume the snapshot so it cannot be reused.
    await authRedisGetDel(snapshotKey(quoteId)).catch(() => null);

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: ConversionAction.EXECUTED,
      entityType: 'conversion',
      entityId: conversion.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        side: plan.side,
        inrAmount: plan.inrAmount,
        usdtAmount: plan.usdtAmount,
        feeInr: plan.feeInr,
        tdsAmount: plan.tdsAmount,
        ledgerTxnId: posted.id,
      },
    });

    return toConversionDto(conversion);
  },

  /** Build the balanced double-entry legs for a conversion. */
  buildLines(userId: string, plan: ConversionPlan): LedgerPostingLine[] {
    const lines: LedgerPostingLine[] = [];
    const feePositive = dec(plan.feeInr).gt(0);
    const tdsPositive = dec(plan.tdsAmount).gt(0);

    if (plan.side === 'INR_TO_USDT') {
      const netInr = dec(plan.inrAmount).sub(dec(plan.feeInr)).toFixed(2);
      // INR leg: user pays → liquidity (net) + fee revenue.
      lines.push({ kind: 'USER_AVAILABLE', userId, asset: INR, direction: 'DEBIT', amount: plan.inrAmount });
      lines.push({ kind: 'LIQUIDITY', userId: null, asset: INR, direction: 'CREDIT', amount: netInr });
      if (feePositive) {
        lines.push({ kind: 'FEE_REVENUE', userId: null, asset: INR, direction: 'CREDIT', amount: plan.feeInr });
      }
      // USDT leg: liquidity → user.
      lines.push({ kind: 'LIQUIDITY', userId: null, asset: USDT, direction: 'DEBIT', amount: plan.usdtAmount });
      lines.push({ kind: 'USER_AVAILABLE', userId, asset: USDT, direction: 'CREDIT', amount: plan.usdtAmount });
      return lines;
    }

    // USDT_TO_INR — user sells USDT for INR (net of fee + §194S TDS).
    lines.push({ kind: 'USER_AVAILABLE', userId, asset: USDT, direction: 'DEBIT', amount: plan.usdtAmount });
    lines.push({ kind: 'LIQUIDITY', userId: null, asset: USDT, direction: 'CREDIT', amount: plan.usdtAmount });
    lines.push({ kind: 'LIQUIDITY', userId: null, asset: INR, direction: 'DEBIT', amount: plan.grossInr });
    lines.push({ kind: 'USER_AVAILABLE', userId, asset: INR, direction: 'CREDIT', amount: plan.inrAmount });
    if (feePositive) {
      lines.push({ kind: 'FEE_REVENUE', userId: null, asset: INR, direction: 'CREDIT', amount: plan.feeInr });
    }
    if (tdsPositive) {
      lines.push({ kind: 'TDS_PAYABLE', userId: null, asset: INR, direction: 'CREDIT', amount: plan.tdsAmount });
    }
    return lines;
  },

  // ==================================================================
  // 9. Conversion history
  // ==================================================================
  async listHistory(input: {
    userId: string;
    side?: ConversionSide;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ConversionDto[]; nextCursor: string | null }> {
    const rows = await conversionRepository.listUserConversions(input);
    return this.page(rows, input.limit);
  },

  // ==================================================================
  // 10. Admin conversion monitoring
  // ==================================================================
  async adminList(
    input: { side?: ConversionSide; userId?: string; cursor?: string; limit: number },
    ctx: ConversionContext = {},
  ): Promise<{ items: ConversionDto[]; nextCursor: string | null }> {
    const rows = await conversionRepository.adminListConversions(input);
    const result = this.page(rows, input.limit);
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: ConversionAction.ADMIN_LIST,
      entityType: 'conversion_queue',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { count: result.items.length },
    });
    if (ctx.actorId) {
      await conversionRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: ConversionAction.ADMIN_LIST,
        targetType: 'conversion_queue',
        ip: ctx.ip,
        requestId: ctx.requestId,
        afterState: { count: result.items.length },
      });
    }
    return result;
  },

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------
  page(
    rows: Conversion[],
    limit: number,
  ): { items: ConversionDto[]; nextCursor: string | null } {
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: slice.map(toConversionDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async assertKycApproved(userId: string): Promise<void> {
    const user = await conversionRepository.findUserKyc(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }
    if (user.kycStatus !== 'APPROVED' || user.kycTier < 1) {
      throw new ForbiddenError('KYC approval is required to convert', 'KYC_REQUIRED');
    }
  },

  async auditExpiry(
    userId: string,
    quoteId: string,
    ctx: ConversionContext,
  ): Promise<void> {
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: ConversionAction.QUOTE_EXPIRED,
      entityType: 'price_quote',
      entityId: quoteId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },
};

export type ConversionService = typeof conversionService;
