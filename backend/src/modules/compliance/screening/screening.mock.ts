/**
 * Deterministic offline mock screening provider (Stage 5.1).
 *
 * Clearly marked as MOCK. It never calls a real vendor and never costs money.
 * Outcomes are driven entirely by keywords in the subject's name/email so a
 * demo or test can deterministically exercise every code path:
 *
 *   "sanction" → SANCTIONS  POSSIBLE_MATCH
 *   "pep"      → PEP        POSSIBLE_MATCH
 *   "media"    → ADVERSE_MEDIA POSSIBLE_MATCH
 *   "fail"     → provider ERROR on every category (fail/error case)
 *   otherwise  → CLEAR on every category
 *
 * Replace with a real provider by implementing ComplianceScreeningProvider and
 * branching in ./index.ts on SCREENING_PROVIDER — no caller changes required.
 */

import { randomUUID } from 'node:crypto';
import type { ScreeningCategory } from '@prisma/client';
import type {
  ComplianceScreeningProvider,
  ScreeningCategoryResult,
  ScreeningRunResult,
  ScreeningSubject,
} from './screening-provider';
import { SCREENING_CATEGORIES } from './screening-provider';

const PROVIDER_NAME = 'screening-mock';

/** Lowercased haystack of the fields the mock keys off. */
function haystack(subject: ScreeningSubject): string {
  return `${subject.fullName ?? ''} ${subject.email ?? ''}`.toLowerCase();
}

function ref(): string {
  return `scr_mock_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function clear(category: ScreeningCategory): ScreeningCategoryResult {
  return {
    category,
    status: 'CLEAR',
    score: 0,
    summary: `No ${category.toLowerCase().replace('_', ' ')} match found (mock).`,
    providerReference: ref(),
    matches: [],
  };
}

function errored(category: ScreeningCategory): ScreeningCategoryResult {
  return {
    category,
    status: 'ERROR',
    score: 0,
    summary: 'Mock provider error — screening could not be completed.',
    providerReference: ref(),
    matches: [],
  };
}

function possibleMatch(
  category: ScreeningCategory,
  subject: ScreeningSubject,
): ScreeningCategoryResult {
  const name = subject.fullName || 'Unknown Subject';
  const byCategory: Record<ScreeningCategory, { listName: string; sourceUrl: string; score: number; note: string }> = {
    SANCTIONS: {
      listName: 'MOCK-OFAC-SDN',
      sourceUrl: 'https://example.test/sanctions/mock',
      score: 86,
      note: 'Name resembles an entry on a mock sanctions list.',
    },
    PEP: {
      listName: 'MOCK-PEP-REGISTER',
      sourceUrl: 'https://example.test/pep/mock',
      score: 78,
      note: 'Name resembles a mock politically-exposed-person record.',
    },
    ADVERSE_MEDIA: {
      listName: 'MOCK-ADVERSE-MEDIA',
      sourceUrl: 'https://example.test/media/mock',
      score: 64,
      note: 'Name appears in mock adverse-media articles.',
    },
  };
  const meta = byCategory[category];
  return {
    category,
    status: 'POSSIBLE_MATCH',
    score: meta.score,
    summary: `Possible ${category.toLowerCase().replace('_', ' ')} match for "${name}" (mock).`,
    providerReference: ref(),
    matches: [
      {
        name,
        matchScore: meta.score,
        listName: meta.listName,
        sourceUrl: meta.sourceUrl,
        details: { note: meta.note, mock: true },
      },
    ],
  };
}

export const screeningMockProvider: ComplianceScreeningProvider = {
  name: PROVIDER_NAME,
  mode: 'mock',

  async screen(subject: ScreeningSubject): Promise<ScreeningRunResult> {
    const hay = haystack(subject);

    // Provider-level failure simulation: every category errors.
    if (hay.includes('fail')) {
      return {
        provider: PROVIDER_NAME,
        mode: 'mock',
        results: SCREENING_CATEGORIES.map(errored),
      };
    }

    const results = SCREENING_CATEGORIES.map((category) => {
      if (category === 'SANCTIONS' && hay.includes('sanction')) {
        return possibleMatch(category, subject);
      }
      if (category === 'PEP' && hay.includes('pep')) {
        return possibleMatch(category, subject);
      }
      if (category === 'ADVERSE_MEDIA' && hay.includes('media')) {
        return possibleMatch(category, subject);
      }
      return clear(category);
    });

    return { provider: PROVIDER_NAME, mode: 'mock', results };
  },
};
