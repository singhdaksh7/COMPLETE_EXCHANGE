import type { Prisma, TaxEventType } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { taxRepository } from './tax.repository';
import { checksumOf, stripSecrets } from '../compliance/evidence.util';
import type { ComplianceContext } from '../compliance/compliance.types';

/**
 * Tax / TDS foundation service (Stage 5.5). India-focused, CALCULATION-ONLY:
 * TDS is computed and recorded but NEVER deducted from the ledger, and nothing
 * is filed with Income Tax / GST / any government system. All outputs carry the
 * TAX_TDS_STAGING_CALCULATION_ONLY label.
 */

export const TAX_LABEL = 'TAX_TDS_STAGING_CALCULATION_ONLY';

const DEFAULT_RULES: Array<{ eventType: TaxEventType; name: string; rateBps: number; description: string }> = [
  { eventType: 'TRADE_SELL', name: 'VDA TDS on sell (194S, illustrative)', rateBps: 100, description: '1% TDS on VDA transfer — illustrative, calculation-only.' },
  { eventType: 'CONVERSION', name: 'VDA conversion TDS (illustrative)', rateBps: 100, description: '1% TDS on conversion — illustrative, calculation-only.' },
  { eventType: 'WITHDRAWAL', name: 'Withdrawal (no TDS placeholder)', rateBps: 0, description: 'No TDS on withdrawal (placeholder).' },
  { eventType: 'FEE', name: 'Fee (no TDS)', rateBps: 0, description: 'Fees are not subject to TDS here.' },
  { eventType: 'OTHER', name: 'Other (no TDS)', rateBps: 0, description: 'Catch-all, no TDS.' },
];

export interface TaxEventInput {
  eventType: TaxEventType;
  grossAmount: number;
  asset?: string;
  sourceType?: string;
  sourceRef?: string;
  financialYear?: string;
}

function round8(n: number): number {
  return Number(n.toFixed(8));
}

/** Indian financial year (Apr–Mar) for a date, e.g. "2025-26". */
export function financialYearOf(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0 = Jan
  const start = m >= 3 ? y : y - 1; // April or later → this year
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/**
 * Pure TDS calculation. `higherTds` (e.g. no-PAN) applies an illustrative bump.
 * Returns the effective rate + computed TDS amount — no IO, no ledger touch.
 */
export function computeTds(grossAmount: number, rateBps: number, higherTds: boolean): { effectiveBps: number; tdsAmount: number } {
  const effectiveBps = higherTds ? Math.min(rateBps === 0 ? 100 : rateBps + 400, 2000) : rateBps;
  const tdsAmount = round8((grossAmount * effectiveBps) / 10000);
  return { effectiveBps, tdsAmount };
}

export const taxService = {
  // ---- rules ----
  async listRules(ctx: ComplianceContext = {}) {
    let rules = await taxRepository.listRules();
    if (rules.length === 0) {
      for (const r of DEFAULT_RULES) {
        await taxRepository.upsertRule(
          r.eventType,
          { eventType: r.eventType, name: r.name, rateBps: r.rateBps, status: 'ACTIVE', description: r.description, createdByAdminId: ctx.actorId ?? null },
          {},
        );
      }
      rules = await taxRepository.listRules();
    }
    return rules;
  },

  async upsertRule(
    input: { eventType: TaxEventType; name: string; rateBps: number; thresholdAmount?: number; status?: 'ACTIVE' | 'DISABLED'; description?: string },
    ctx: ComplianceContext = {},
  ) {
    const rule = await taxRepository.upsertRule(
      input.eventType,
      {
        eventType: input.eventType,
        name: input.name,
        rateBps: input.rateBps,
        thresholdAmount: input.thresholdAmount != null ? (input.thresholdAmount as unknown as Prisma.Decimal) : null,
        status: input.status ?? 'ACTIVE',
        description: input.description ?? null,
        createdByAdminId: ctx.actorId ?? null,
      },
      {
        name: input.name,
        rateBps: input.rateBps,
        ...(input.thresholdAmount != null ? { thresholdAmount: input.thresholdAmount as unknown as Prisma.Decimal } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    );
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'tax.rule.upsert',
      entityType: 'tax_rule',
      entityId: rule.id,
      metadata: { eventType: rule.eventType, rateBps: rule.rateBps } as Prisma.InputJsonValue,
    });
    return rule;
  },

  // ---- profile ----
  getProfile(userId: string) {
    return taxRepository.findProfile(userId);
  },

  async upsertProfile(
    userId: string,
    input: { panAvailable?: boolean; panStatus?: string; residentStatus?: string; higherTdsApplicable?: boolean; notes?: string },
    ctx: ComplianceContext = {},
  ) {
    const panAvailable = input.panAvailable ?? false;
    const higherTds = input.higherTdsApplicable ?? !panAvailable; // no PAN → higher TDS (illustrative)
    const profile = await taxRepository.upsertProfile(
      userId,
      {
        userId,
        panAvailable,
        panStatus: input.panStatus ?? (panAvailable ? 'PROVIDED' : 'MISSING'),
        residentStatus: input.residentStatus ?? 'RESIDENT',
        higherTdsApplicable: higherTds,
        notes: input.notes ?? null,
        updatedByAdminId: ctx.actorId ?? null,
      },
      {
        panAvailable,
        ...(input.panStatus !== undefined ? { panStatus: input.panStatus } : { panStatus: panAvailable ? 'PROVIDED' : 'MISSING' }),
        ...(input.residentStatus !== undefined ? { residentStatus: input.residentStatus } : {}),
        higherTdsApplicable: higherTds,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(ctx.actorId ? { updatedByAdminId: ctx.actorId } : {}),
      },
    );
    return profile;
  },

  /** Record CALCULATION-ONLY TDS records for a set of (mock) taxable events. */
  async recordEvents(
    userId: string,
    events: TaxEventInput[],
    ctx: ComplianceContext = {},
  ) {
    const [profile, rules] = await Promise.all([taxRepository.findProfile(userId), this.listRules(ctx)]);
    const higherTds = profile?.higherTdsApplicable ?? true; // default to higher when no profile/PAN
    const ruleByEvent = new Map(rules.map((r) => [r.eventType, r]));
    const created = [];
    for (const e of events) {
      const rule = ruleByEvent.get(e.eventType);
      const rateBps = rule && rule.status === 'ACTIVE' ? rule.rateBps : 0;
      const { effectiveBps, tdsAmount } = computeTds(e.grossAmount, rateBps, higherTds);
      const rec = await taxRepository.createTds({
        userId,
        eventType: e.eventType,
        ruleId: rule?.id ?? null,
        sourceType: e.sourceType ?? null,
        sourceRef: e.sourceRef ?? null,
        grossAmount: e.grossAmount as unknown as Prisma.Decimal,
        asset: e.asset ?? null,
        rateBps: effectiveBps,
        tdsAmount: tdsAmount as unknown as Prisma.Decimal,
        status: 'CALCULATED',
        label: TAX_LABEL,
        financialYear: e.financialYear ?? financialYearOf(),
        createdByAdminId: ctx.actorId ?? null,
      });
      created.push(rec);
    }
    return created;
  },

  /** Summary of recorded TDS for a user (calculation-only). */
  async summary(userId: string, financialYear?: string) {
    const records = await taxRepository.tdsForUser(userId, financialYear);
    let totalGross = 0;
    let totalTds = 0;
    const byEvent: Record<string, { count: number; gross: number; tds: number }> = {};
    for (const r of records) {
      const gross = Number(r.grossAmount.toString());
      const tds = Number(r.tdsAmount.toString());
      totalGross += gross;
      totalTds += tds;
      const k = r.eventType;
      byEvent[k] = byEvent[k] ?? { count: 0, gross: 0, tds: 0 };
      byEvent[k].count += 1;
      byEvent[k].gross += gross;
      byEvent[k].tds += tds;
    }
    return {
      label: TAX_LABEL,
      financialYear: financialYear ?? financialYearOf(),
      recordCount: records.length,
      totalGross: round8(totalGross),
      totalTds: round8(totalTds),
      byEvent,
    };
  },

  /** Generate a JSON-first internal tax statement (optionally recording events). */
  async generateStatement(
    userId: string,
    financialYear: string,
    events: TaxEventInput[] | undefined,
    ctx: ComplianceContext = {},
  ) {
    if (events && events.length > 0) {
      await this.recordEvents(userId, events.map((e) => ({ ...e, financialYear })), ctx);
    }
    const summary = await this.summary(userId, financialYear);
    let payload: Record<string, unknown> = {
      label: TAX_LABEL,
      disclaimer: 'Internal TDS/tax statement — STAGING CALCULATION ONLY. Not filed with Income Tax / GST / any government system.',
      userId,
      financialYear,
      generatedAt: new Date().toISOString(),
      generatedBy: ctx.actorId ?? 'system',
      summary,
    };
    payload = stripSecrets(payload) as Record<string, unknown>;
    const checksum = checksumOf(payload);
    payload.checksum = checksum;

    const statement = await taxRepository.createStatement({
      userId,
      financialYear,
      status: 'GENERATED',
      label: TAX_LABEL,
      totalGross: summary.totalGross as unknown as Prisma.Decimal,
      totalTds: summary.totalTds as unknown as Prisma.Decimal,
      recordCount: summary.recordCount,
      checksum,
      payload: payload as Prisma.InputJsonValue,
      generatedByAdminId: ctx.actorId ?? null,
    });
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'tax.statement.generate',
      entityType: 'tax_statement',
      entityId: statement.id,
      metadata: { financialYear, checksum } as Prisma.InputJsonValue,
    });
    return statement;
  },

  async listStatements(input: { userId?: string; limit: number; cursor?: string }) {
    const rows = await taxRepository.listStatements(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },

  async listTds(input: { userId?: string; eventType?: TaxEventType; financialYear?: string; limit: number; cursor?: string }) {
    const rows = await taxRepository.listTds(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },
};

export type TaxService = typeof taxService;
