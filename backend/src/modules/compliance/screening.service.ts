import { randomUUID } from 'node:crypto';
import {
  Prisma,
  type ScreeningCategory,
  type ScreeningCheckStatus,
  type ScreeningDecision,
  type ScreeningStatus,
} from '@prisma/client';
import { logger } from '../../lib/logger';
import { getScreeningProvider } from './screening';
import type { ScreeningSubject } from './screening';
import {
  screeningRepository,
  type ScreeningCheckWithMatches,
} from './screening.repository';

/**
 * Screening persistence + pure helpers (Stage 5.1).
 *
 * This module owns provider execution and the screening_checks/matches tables.
 * It deliberately does NOT import complianceService (which orchestrates risk
 * recompute / audit) — complianceService calls into here, never the reverse, so
 * there is no import cycle.
 */

const CATEGORY_ORDER: ScreeningCategory[] = ['SANCTIONS', 'PEP', 'ADVERSE_MEDIA'];

/* ------------------------------------------------------------------ */
/* Pure helpers — fully unit-testable, no IO.                          */
/* ------------------------------------------------------------------ */

/**
 * Map a check's status + admin decision onto the lighter per-dimension
 * ScreeningStatus posture stored on ComplianceProfile (and fed to the risk
 * engine). An admin APPROVED/FALSE_POSITIVE resolves a possible match to CLEAR;
 * a REJECTED possible match becomes a confirmed HIT.
 */
export function checkPosture(
  status: ScreeningCheckStatus,
  decision: ScreeningDecision | null,
): ScreeningStatus {
  if (decision === 'APPROVED' || decision === 'FALSE_POSITIVE') return 'CLEAR';
  switch (status) {
    case 'CLEAR':
      return 'CLEAR';
    case 'PENDING':
      return 'PENDING';
    case 'POSSIBLE_MATCH':
      return decision === 'REJECTED' ? 'HIT' : 'REVIEW_REQUIRED';
    case 'FAILED':
    case 'ERROR':
      return 'REVIEW_REQUIRED';
    default:
      return 'PENDING';
  }
}

/**
 * A check blocks KYC approval when it is anything other than CLEAR and has not
 * been resolved by an admin as APPROVED / FALSE_POSITIVE. (REJECTED still
 * blocks an *approval* — a confirmed hit should lead to KYC rejection, not
 * approval — though an admin with override can force through.)
 */
export function isBlocking(
  status: ScreeningCheckStatus,
  decision: ScreeningDecision | null,
): boolean {
  if (status === 'CLEAR') return false;
  if (decision === 'APPROVED' || decision === 'FALSE_POSITIVE') return false;
  return true;
}

/** Collapse the latest-per-category checks into one overall status label. */
export function overallStatus(
  latest: Map<ScreeningCategory, ScreeningCheckWithMatches>,
): ScreeningCheckStatus | 'NOT_SCREENED' {
  if (latest.size === 0) return 'NOT_SCREENED';
  const checks = [...latest.values()];
  const unresolved = (c: ScreeningCheckWithMatches) =>
    c.decision !== 'APPROVED' && c.decision !== 'FALSE_POSITIVE';
  if (checks.some((c) => (c.status === 'FAILED' || c.status === 'ERROR') && unresolved(c))) {
    return 'ERROR';
  }
  if (checks.some((c) => c.status === 'POSSIBLE_MATCH' && unresolved(c))) {
    return 'POSSIBLE_MATCH';
  }
  if (checks.some((c) => c.status === 'PENDING')) return 'PENDING';
  return 'CLEAR';
}

/**
 * Cheap overall label derived from the per-dimension ScreeningStatus posture
 * already stored on a ComplianceProfile — used for the admin queue badge so the
 * list view needs no extra per-row query.
 */
export function overallFromPosture(
  statuses: ScreeningStatus[],
): ScreeningCheckStatus | 'NOT_SCREENED' {
  if (statuses.every((s) => s === 'NOT_SCREENED')) return 'NOT_SCREENED';
  if (statuses.some((s) => s === 'HIT' || s === 'REVIEW_REQUIRED')) return 'POSSIBLE_MATCH';
  if (statuses.some((s) => s === 'PENDING')) return 'PENDING';
  return 'CLEAR';
}

export interface ScreeningGate {
  blocked: boolean;
  /** Categories that currently block approval (empty when not blocked). */
  blockingCategories: ScreeningCategory[];
  overall: ScreeningCheckStatus | 'NOT_SCREENED';
}

export function computeGate(
  latest: Map<ScreeningCategory, ScreeningCheckWithMatches>,
): ScreeningGate {
  const blockingCategories = [...latest.values()]
    .filter((c) => isBlocking(c.status, c.decision))
    .map((c) => c.category);
  return {
    blocked: blockingCategories.length > 0,
    blockingCategories,
    overall: overallStatus(latest),
  };
}

/* ------------------------------------------------------------------ */
/* DTOs                                                                */
/* ------------------------------------------------------------------ */

export function toScreeningMatchDto(m: ScreeningCheckWithMatches['matches'][number]) {
  return {
    id: m.id,
    category: m.category,
    name: m.name,
    matchScore: m.matchScore,
    listName: m.listName,
    sourceUrl: m.sourceUrl,
    details: m.details,
    createdAt: m.createdAt,
  };
}

export function toScreeningCheckDto(c: ScreeningCheckWithMatches) {
  return {
    id: c.id,
    batchId: c.batchId,
    category: c.category,
    status: c.status,
    provider: c.provider,
    providerMode: c.providerMode,
    providerReference: c.providerReference,
    score: c.score,
    summary: c.summary,
    decision: c.decision,
    decisionNote: c.decisionNote,
    decidedByAdminId: c.decidedByAdminId,
    decidedAt: c.decidedAt,
    blocking: isBlocking(c.status, c.decision),
    matches: c.matches.map(toScreeningMatchDto),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Build the admin-facing screening view: checks + per-category latest + gate. */
export async function buildScreeningView(userId: string) {
  const [checks, latest] = await Promise.all([
    screeningRepository.listChecks(userId),
    screeningRepository.latestChecksByCategory(userId),
  ]);
  const gate = computeGate(latest);
  const byCategory: Record<string, ReturnType<typeof toScreeningCheckDto> | null> = {
    SANCTIONS: null,
    PEP: null,
    ADVERSE_MEDIA: null,
  };
  for (const cat of CATEGORY_ORDER) {
    const c = latest.get(cat);
    byCategory[cat] = c ? toScreeningCheckDto(c) : null;
  }
  return {
    overall: gate.overall,
    blocked: gate.blocked,
    blockingCategories: gate.blockingCategories,
    byCategory,
    checks: checks.map(toScreeningCheckDto),
  };
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const screeningService = {
  /**
   * Run the active provider for a subject and persist one check per category
   * (grouped by a fresh batchId), plus any candidate matches. Returns the
   * latest-per-category map so the caller can update the profile posture.
   */
  async execute(
    subject: ScreeningSubject,
  ): Promise<Map<ScreeningCategory, ScreeningCheckWithMatches>> {
    const provider = getScreeningProvider();
    const run = await provider.screen(subject);
    const batchId = randomUUID();

    for (const result of run.results) {
      const check = await screeningRepository.createCheck({
        userId: subject.userId,
        batchId,
        category: result.category,
        status: result.status,
        provider: run.provider,
        providerMode: run.mode,
        providerReference: result.providerReference,
        score: result.score,
        summary: result.summary,
      });
      const matchRows: Prisma.ScreeningMatchUncheckedCreateInput[] = result.matches.map(
        (m) => ({
          checkId: check.id,
          category: result.category,
          name: m.name,
          matchScore: m.matchScore,
          listName: m.listName ?? null,
          sourceUrl: m.sourceUrl ?? null,
          details: (m.details ?? null) as Prisma.InputJsonValue,
        }),
      );
      await screeningRepository.createMatches(matchRows);
    }

    logger.info(
      { userId: subject.userId, provider: run.provider, mode: run.mode, batchId },
      'screening: run completed',
    );
    return screeningRepository.latestChecksByCategory(subject.userId);
  },

  /** Apply an admin disposition to a single check. */
  async applyDecision(
    checkId: string,
    decision: ScreeningDecision,
    note: string | undefined,
    adminId: string | undefined,
  ) {
    return screeningRepository.updateCheck(checkId, {
      decision,
      decisionNote: note ?? null,
      decidedByAdminId: adminId ?? null,
      decidedAt: new Date(),
    });
  },

  findCheck: screeningRepository.findCheck,
  listChecks: screeningRepository.listChecks,
  latestByCategory: screeningRepository.latestChecksByCategory,
  buildView: buildScreeningView,

  /**
   * The per-dimension posture (sanctions/pep/adverse-media) derived from the
   * latest checks — written onto the ComplianceProfile so the existing risk
   * engine and DTOs pick up screening outcomes without any signature change.
   */
  posturePatch(latest: Map<ScreeningCategory, ScreeningCheckWithMatches>) {
    const get = (cat: ScreeningCategory): ScreeningStatus | undefined => {
      const c = latest.get(cat);
      return c ? checkPosture(c.status, c.decision) : undefined;
    };
    const patch: {
      sanctionsStatus?: ScreeningStatus;
      pepStatus?: ScreeningStatus;
      adverseMediaStatus?: ScreeningStatus;
    } = {};
    const s = get('SANCTIONS');
    const p = get('PEP');
    const a = get('ADVERSE_MEDIA');
    if (s) patch.sanctionsStatus = s;
    if (p) patch.pepStatus = p;
    if (a) patch.adverseMediaStatus = a;
    return patch;
  },
};

export type ScreeningService = typeof screeningService;
