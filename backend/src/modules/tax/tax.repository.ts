import {
  Prisma,
  type TaxEventType,
  type TaxRule,
  type TaxStatement,
  type TdsRecord,
  type UserTaxProfile,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 5.5 tax/TDS tables. Owns tax_rules / user_tax_profiles
 * / tds_records / tax_statements. TDS here is CALCULATION-ONLY — it is recorded
 * but NEVER deducted from the ledger. This repo never touches ledger / trading /
 * scanner / withdrawal state and never deletes a record.
 */

export const taxRepository = {
  // ---- rules ----
  listRules(): Promise<TaxRule[]> {
    return prisma.taxRule.findMany({ orderBy: { eventType: 'asc' } });
  },
  findRule(eventType: TaxEventType): Promise<TaxRule | null> {
    return prisma.taxRule.findUnique({ where: { eventType } });
  },
  upsertRule(
    eventType: TaxEventType,
    create: Prisma.TaxRuleUncheckedCreateInput,
    update: Prisma.TaxRuleUncheckedUpdateInput,
  ): Promise<TaxRule> {
    return prisma.taxRule.upsert({ where: { eventType }, create: { ...create, eventType }, update });
  },

  // ---- user tax profile ----
  findProfile(userId: string): Promise<UserTaxProfile | null> {
    return prisma.userTaxProfile.findUnique({ where: { userId } });
  },
  upsertProfile(
    userId: string,
    create: Prisma.UserTaxProfileUncheckedCreateInput,
    update: Prisma.UserTaxProfileUncheckedUpdateInput,
  ): Promise<UserTaxProfile> {
    return prisma.userTaxProfile.upsert({ where: { userId }, create: { ...create, userId }, update });
  },

  // ---- tds records ----
  createTds(data: Prisma.TdsRecordUncheckedCreateInput): Promise<TdsRecord> {
    return prisma.tdsRecord.create({ data });
  },
  listTds(input: { userId?: string; eventType?: TaxEventType; financialYear?: string; limit: number; cursor?: string }): Promise<TdsRecord[]> {
    return prisma.tdsRecord.findMany({
      where: {
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.eventType ? { eventType: input.eventType } : {}),
        ...(input.financialYear ? { financialYear: input.financialYear } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },
  /** Aggregate TDS for a user (+ optional FY) grouped per event type. */
  tdsForUser(userId: string, financialYear?: string): Promise<TdsRecord[]> {
    return prisma.tdsRecord.findMany({
      where: { userId, ...(financialYear ? { financialYear } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
  },

  // ---- statements ----
  createStatement(data: Prisma.TaxStatementUncheckedCreateInput): Promise<TaxStatement> {
    return prisma.taxStatement.create({ data });
  },
  listStatements(input: { userId?: string; limit: number; cursor?: string }): Promise<TaxStatement[]> {
    return prisma.taxStatement.findMany({
      where: {
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },
};

export type TaxRepository = typeof taxRepository;
