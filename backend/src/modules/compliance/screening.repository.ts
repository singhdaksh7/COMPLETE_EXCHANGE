import {
  Prisma,
  type ScreeningCategory,
  type ScreeningCheck,
  type ScreeningMatch,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the screening layer (Stage 5.1) — the ONLY place that talks to
 * Prisma for screening_checks / screening_matches. It never touches ledger,
 * trading, or withdrawal state, and never deletes records.
 */

export type ScreeningCheckWithMatches = ScreeningCheck & { matches: ScreeningMatch[] };

export const screeningRepository = {
  createCheck(
    data: Prisma.ScreeningCheckUncheckedCreateInput,
  ): Promise<ScreeningCheck> {
    return prisma.screeningCheck.create({ data });
  },

  createMatches(
    rows: Prisma.ScreeningMatchUncheckedCreateInput[],
  ): Promise<Prisma.BatchPayload> {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return prisma.screeningMatch.createMany({ data: rows });
  },

  findCheck(id: string): Promise<ScreeningCheckWithMatches | null> {
    return prisma.screeningCheck.findUnique({
      where: { id },
      include: { matches: true },
    }) as Promise<ScreeningCheckWithMatches | null>;
  },

  updateCheck(
    id: string,
    data: Prisma.ScreeningCheckUncheckedUpdateInput,
  ): Promise<ScreeningCheck> {
    return prisma.screeningCheck.update({ where: { id }, data });
  },

  /** All screening checks for a user, newest first, with their matches. */
  listChecks(userId: string): Promise<ScreeningCheckWithMatches[]> {
    return prisma.screeningCheck.findMany({
      where: { userId },
      include: { matches: { orderBy: { matchScore: 'desc' } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }) as Promise<ScreeningCheckWithMatches[]>;
  },

  /**
   * The latest screening check per category for a user (one row per category).
   * Drives the user-facing status, the risk integration and the approval gate.
   */
  async latestChecksByCategory(
    userId: string,
  ): Promise<Map<ScreeningCategory, ScreeningCheckWithMatches>> {
    const rows = (await prisma.screeningCheck.findMany({
      where: { userId },
      include: { matches: { orderBy: { matchScore: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    })) as ScreeningCheckWithMatches[];
    const latest = new Map<ScreeningCategory, ScreeningCheckWithMatches>();
    for (const row of rows) {
      if (!latest.has(row.category)) latest.set(row.category, row);
    }
    return latest;
  },
};

export type ScreeningRepository = typeof screeningRepository;
