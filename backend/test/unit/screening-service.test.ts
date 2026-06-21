import { describe, it, expect } from 'vitest';
import type { ScreeningCategory } from '@prisma/client';
import {
  checkPosture,
  isBlocking,
  computeGate,
  overallStatus,
  overallFromPosture,
} from '../../src/modules/compliance/screening.service';
import type { ScreeningCheckWithMatches } from '../../src/modules/compliance/screening.repository';

function check(over: Partial<ScreeningCheckWithMatches>): ScreeningCheckWithMatches {
  return {
    id: 'chk',
    userId: 'user-1',
    batchId: 'batch-1',
    category: 'SANCTIONS',
    status: 'CLEAR',
    provider: 'screening-mock',
    providerMode: 'mock',
    providerReference: 'ref',
    score: 0,
    summary: null,
    decision: null,
    decisionNote: null,
    decidedByAdminId: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    matches: [],
    ...over,
  } as ScreeningCheckWithMatches;
}

function mapOf(...checks: ScreeningCheckWithMatches[]) {
  const m = new Map<ScreeningCategory, ScreeningCheckWithMatches>();
  for (const c of checks) m.set(c.category, c);
  return m;
}

describe('checkPosture', () => {
  it('CLEAR stays CLEAR', () => {
    expect(checkPosture('CLEAR', null)).toBe('CLEAR');
  });
  it('POSSIBLE_MATCH undecided needs review', () => {
    expect(checkPosture('POSSIBLE_MATCH', null)).toBe('REVIEW_REQUIRED');
  });
  it('POSSIBLE_MATCH resolved as FALSE_POSITIVE clears', () => {
    expect(checkPosture('POSSIBLE_MATCH', 'FALSE_POSITIVE')).toBe('CLEAR');
  });
  it('POSSIBLE_MATCH resolved as APPROVED clears', () => {
    expect(checkPosture('POSSIBLE_MATCH', 'APPROVED')).toBe('CLEAR');
  });
  it('POSSIBLE_MATCH REJECTED becomes a confirmed HIT', () => {
    expect(checkPosture('POSSIBLE_MATCH', 'REJECTED')).toBe('HIT');
  });
  it('FAILED / ERROR need review', () => {
    expect(checkPosture('FAILED', null)).toBe('REVIEW_REQUIRED');
    expect(checkPosture('ERROR', null)).toBe('REVIEW_REQUIRED');
  });
});

describe('isBlocking', () => {
  it('CLEAR never blocks', () => {
    expect(isBlocking('CLEAR', null)).toBe(false);
  });
  it('an undecided possible match blocks', () => {
    expect(isBlocking('POSSIBLE_MATCH', null)).toBe(true);
  });
  it('FAILED / ERROR / PENDING block', () => {
    expect(isBlocking('FAILED', null)).toBe(true);
    expect(isBlocking('ERROR', null)).toBe(true);
    expect(isBlocking('PENDING', null)).toBe(true);
  });
  it('a possible match resolved as FALSE_POSITIVE no longer blocks', () => {
    expect(isBlocking('POSSIBLE_MATCH', 'FALSE_POSITIVE')).toBe(false);
  });
  it('a REJECTED possible match still blocks approval', () => {
    expect(isBlocking('POSSIBLE_MATCH', 'REJECTED')).toBe(true);
  });
});

describe('computeGate', () => {
  it('all-clear is not blocked', () => {
    const gate = computeGate(mapOf(check({ category: 'SANCTIONS' }), check({ category: 'PEP' })));
    expect(gate.blocked).toBe(false);
    expect(gate.blockingCategories).toEqual([]);
    expect(gate.overall).toBe('CLEAR');
  });

  it('an unresolved possible sanctions match blocks and is reported', () => {
    const gate = computeGate(
      mapOf(check({ category: 'SANCTIONS', status: 'POSSIBLE_MATCH', score: 80 })),
    );
    expect(gate.blocked).toBe(true);
    expect(gate.blockingCategories).toContain('SANCTIONS');
    expect(gate.overall).toBe('POSSIBLE_MATCH');
  });

  it('a provider error blocks and surfaces overall ERROR', () => {
    const gate = computeGate(mapOf(check({ category: 'PEP', status: 'ERROR' })));
    expect(gate.blocked).toBe(true);
    expect(gate.overall).toBe('ERROR');
  });

  it('resolving the possible match unblocks approval', () => {
    const gate = computeGate(
      mapOf(check({ category: 'SANCTIONS', status: 'POSSIBLE_MATCH', decision: 'FALSE_POSITIVE' })),
    );
    expect(gate.blocked).toBe(false);
  });
});

describe('overallStatus', () => {
  it('empty map is NOT_SCREENED', () => {
    expect(overallStatus(new Map())).toBe('NOT_SCREENED');
  });
  it('ERROR outranks POSSIBLE_MATCH', () => {
    const m = mapOf(
      check({ category: 'SANCTIONS', status: 'POSSIBLE_MATCH' }),
      check({ category: 'PEP', status: 'ERROR' }),
    );
    expect(overallStatus(m)).toBe('ERROR');
  });
});

describe('overallFromPosture', () => {
  it('all NOT_SCREENED', () => {
    expect(overallFromPosture(['NOT_SCREENED', 'NOT_SCREENED', 'NOT_SCREENED'])).toBe('NOT_SCREENED');
  });
  it('a HIT or REVIEW_REQUIRED surfaces POSSIBLE_MATCH', () => {
    expect(overallFromPosture(['CLEAR', 'REVIEW_REQUIRED', 'CLEAR'])).toBe('POSSIBLE_MATCH');
    expect(overallFromPosture(['HIT', 'CLEAR', 'CLEAR'])).toBe('POSSIBLE_MATCH');
  });
  it('pending posture surfaces PENDING', () => {
    expect(overallFromPosture(['PENDING', 'CLEAR', 'CLEAR'])).toBe('PENDING');
  });
  it('all clear is CLEAR', () => {
    expect(overallFromPosture(['CLEAR', 'CLEAR', 'CLEAR'])).toBe('CLEAR');
  });
});
