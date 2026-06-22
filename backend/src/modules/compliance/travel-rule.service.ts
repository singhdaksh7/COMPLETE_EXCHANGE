import type { Prisma, TravelRuleStatus, TravelRuleTransfer } from '@prisma/client';
import { config } from '../../config';
import { recordAudit } from '../../lib/audit';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { walletRiskRepository } from './wallet-risk.repository';
import { dayBucket } from './monitoring.rules';
import type { ComplianceContext } from './compliance.types';

/**
 * Travel Rule foundation service (Stage 5.3).
 *
 * Records the data-collection lifecycle for transfers over a configured
 * threshold and exposes safe status transitions + a MOCK export packet. It is
 * pure metadata: SENT_MOCK never transmits a real Travel Rule message, and
 * nothing here submits to any FIU/VASP or touches money movement.
 */

export type TravelRuleAction = 'COLLECTED' | 'EXEMPTED' | 'SENT_MOCK' | 'REQUEST_INFO';

/**
 * Pure transition table. Returns the target status for an action from a current
 * status, or null when the transition is invalid. Terminal states (SENT_MOCK,
 * EXEMPTED) accept no further actions.
 */
export function nextStatusForAction(
  current: TravelRuleStatus,
  action: TravelRuleAction,
): TravelRuleStatus | null {
  switch (action) {
    case 'REQUEST_INFO':
      return current === 'REQUIRED' || current === 'FAILED' ? 'PENDING_INFO' : null;
    case 'COLLECTED':
      return current === 'REQUIRED' || current === 'PENDING_INFO' || current === 'FAILED'
        ? 'READY'
        : null;
    case 'SENT_MOCK':
      return current === 'READY' ? 'SENT_MOCK' : null;
    case 'EXEMPTED':
      return current === 'SENT_MOCK' || current === 'EXEMPTED' ? null : 'EXEMPTED';
    default:
      return null;
  }
}

/** Whether a transfer amount requires Travel Rule data collection. */
export function isTravelRuleRequired(amount: number, threshold = config.compliance.travelRule.threshold): boolean {
  return amount >= threshold;
}

export const travelRuleService = {
  /**
   * Idempotently record a Travel Rule transfer (one per business key). Initial
   * status is REQUIRED when amount >= threshold, else NOT_REQUIRED. Safe to call
   * from a foundation hook; it does not block or alter money movement.
   */
  async record(
    input: {
      direction: 'INBOUND' | 'OUTBOUND';
      userId?: string | null;
      chain: string;
      asset: string;
      amount: number;
      counterpartyAddress?: string | null;
      withdrawalId?: string | null;
      depositId?: string | null;
      dedupeKey?: string;
    },
    ctx: ComplianceContext = {},
  ): Promise<{ transfer: TravelRuleTransfer; created: boolean }> {
    const threshold = config.compliance.travelRule.threshold;
    const required = isTravelRuleRequired(input.amount, threshold);
    const dedupeKey =
      input.dedupeKey ??
      `TRAVELRULE:${input.direction}:${input.withdrawalId ?? input.depositId ?? `${input.chain}:${input.counterpartyAddress ?? 'na'}:${dayBucket(new Date())}`}`;

    const result = await walletRiskRepository.upsertTransfer({
      direction: input.direction,
      status: required ? 'REQUIRED' : 'NOT_REQUIRED',
      userId: input.userId ?? null,
      chain: input.chain,
      asset: input.asset,
      amount: input.amount as unknown as Prisma.Decimal,
      thresholdAmount: threshold as unknown as Prisma.Decimal,
      counterpartyAddress: input.counterpartyAddress ?? null,
      withdrawalId: input.withdrawalId ?? null,
      depositId: input.depositId ?? null,
      dedupeKey,
    });

    if (result.created) {
      await recordAudit({
        actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
        actorId: ctx.actorId ?? null,
        action: 'compliance.travel_rule.record',
        entityType: 'travel_rule_transfer',
        entityId: result.transfer.id,
        metadata: { direction: input.direction, required } as Prisma.InputJsonValue,
      });
    }
    return result;
  },

  /** Apply a lifecycle action with a guarded, pure transition. */
  async applyAction(
    id: string,
    action: TravelRuleAction,
    opts: { note?: string; exemptedReason?: string } = {},
    ctx: ComplianceContext = {},
  ): Promise<TravelRuleTransfer> {
    const transfer = await walletRiskRepository.findTransfer(id);
    if (!transfer) throw new NotFoundError('Travel Rule transfer not found');

    const target = nextStatusForAction(transfer.status, action);
    if (!target) {
      throw new BadRequestError(
        `Cannot ${action} a transfer in status ${transfer.status}`,
        { code: 'TRAVEL_RULE_INVALID_TRANSITION' },
      );
    }

    const data: Prisma.TravelRuleTransferUncheckedUpdateInput = {
      status: target,
      reviewedByAdminId: ctx.actorId ?? null,
      ...(opts.note ? { notes: opts.note } : {}),
    };
    if (action === 'COLLECTED') data.infoCollectedAt = new Date();
    if (action === 'SENT_MOCK') data.sentMockAt = new Date();
    if (action === 'EXEMPTED') data.exemptedReason = opts.exemptedReason ?? opts.note ?? 'Exempted by admin';

    const updated = await walletRiskRepository.updateTransfer(id, data);

    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.travel_rule.action',
      entityType: 'travel_rule_transfer',
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { action, from: transfer.status, to: target } as Prisma.InputJsonValue,
    });

    return updated;
  },

  async list(input: Parameters<typeof walletRiskRepository.listTransfers>[0]) {
    const rows = await walletRiskRepository.listTransfers(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },

  async get(id: string) {
    const transfer = await walletRiskRepository.findTransfer(id);
    if (!transfer) throw new NotFoundError('Travel Rule transfer not found');
    return transfer;
  },

  /** Build a MOCK Travel Rule export packet (JSON only — never transmitted). */
  async exportMockPacket(id: string, ctx: ComplianceContext = {}) {
    const transfer = await walletRiskRepository.findTransfer(id);
    if (!transfer) throw new NotFoundError('Travel Rule transfer not found');
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.travel_rule.export',
      entityType: 'travel_rule_transfer',
      entityId: id,
      metadata: { status: transfer.status } as Prisma.InputJsonValue,
    });
    return {
      exportType: 'TRAVEL_RULE_MOCK_ONLY',
      disclaimer:
        'INTERNAL MOCK PACKET ONLY. This is a rule-based/mock Travel Rule data record for internal review. ' +
        'It is NOT transmitted to any VASP, FIU, or Travel Rule network, and contains no secrets.',
      generatedAt: new Date().toISOString(),
      transfer: {
        id: transfer.id,
        direction: transfer.direction,
        status: transfer.status,
        chain: transfer.chain,
        asset: transfer.asset,
        amount: transfer.amount,
        thresholdAmount: transfer.thresholdAmount,
        counterpartyAddress: transfer.counterpartyAddress,
        counterparty: transfer.counterparty,
        originatorName: transfer.originatorName,
        beneficiaryName: transfer.beneficiaryName,
        infoCollectedAt: transfer.infoCollectedAt,
        sentMockAt: transfer.sentMockAt,
        exemptedReason: transfer.exemptedReason,
        createdAt: transfer.createdAt,
      },
    };
  },

  summary: () => walletRiskRepository.summary(),
};

export type TravelRuleService = typeof travelRuleService;
