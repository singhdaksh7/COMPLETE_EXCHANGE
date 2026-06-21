/**
 * Compliance screening provider abstraction (Stage 5.1).
 *
 * A vendor-neutral interface for sanctions / PEP / adverse-media screening so
 * the compliance flow never depends on a concrete vendor. Today only a
 * deterministic offline mock is implemented; future providers (e.g.
 * ComplyAdvantage / Refinitiv World-Check / Sumsub) implement the same contract
 * and are selected via SCREENING_PROVIDER.
 *
 * Providers return ONLY a normalized outcome + redacted candidate matches —
 * never raw vendor payloads, full watch-list records, or vendor credentials.
 */

import type { ScreeningCategory, ScreeningCheckStatus } from '@prisma/client';

/** The three screening dimensions, in canonical order. */
export const SCREENING_CATEGORIES: ScreeningCategory[] = [
  'SANCTIONS',
  'PEP',
  'ADVERSE_MEDIA',
];

/** Subject details handed to a provider. PII is limited to what is screened. */
export interface ScreeningSubject {
  userId: string;
  fullName: string | null;
  email: string | null;
  countryOfResidence?: string | null;
  nationality?: string | null;
}

/** A single redacted candidate match. */
export interface ScreeningProviderMatch {
  name: string;
  /** 0..100 confidence this candidate is the subject. */
  matchScore: number;
  listName?: string | null;
  sourceUrl?: string | null;
  details?: Record<string, unknown>;
}

/** Per-category screening outcome. */
export interface ScreeningCategoryResult {
  category: ScreeningCategory;
  status: ScreeningCheckStatus;
  /** 0..100 top-match confidence (0 when CLEAR). */
  score: number;
  summary: string;
  /** Opaque, non-PII provider reference for the check. */
  providerReference: string;
  matches: ScreeningProviderMatch[];
}

/** Full result of a screening run across all categories. */
export interface ScreeningRunResult {
  provider: string;
  mode: 'mock' | 'live';
  results: ScreeningCategoryResult[];
}

export interface ComplianceScreeningProvider {
  name: string;
  mode: 'mock' | 'live';
  /** Screen a subject across sanctions / PEP / adverse-media in one call. */
  screen(subject: ScreeningSubject): Promise<ScreeningRunResult>;
}
