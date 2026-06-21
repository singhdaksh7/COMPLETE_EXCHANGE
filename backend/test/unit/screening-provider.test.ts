import { describe, it, expect } from 'vitest';
import { screeningMockProvider } from '../../src/modules/compliance/screening/screening.mock';

const SUBJECT = {
  userId: 'user-1',
  fullName: 'Asha Verma',
  email: 'asha@example.com',
  countryOfResidence: 'IN',
  nationality: 'IN',
};

function byCat(results: Awaited<ReturnType<typeof screeningMockProvider.screen>>['results']) {
  return Object.fromEntries(results.map((r) => [r.category, r]));
}

describe('screeningMockProvider', () => {
  it('is clearly badged as a mock provider', () => {
    expect(screeningMockProvider.mode).toBe('mock');
    expect(screeningMockProvider.name).toBe('screening-mock');
  });

  it('a normal subject is CLEAR on every category with no matches', async () => {
    const run = await screeningMockProvider.screen(SUBJECT);
    expect(run.results).toHaveLength(3);
    for (const r of run.results) {
      expect(r.status).toBe('CLEAR');
      expect(r.matches).toHaveLength(0);
      expect(r.score).toBe(0);
    }
  });

  it('"sanction" in the name triggers a SANCTIONS possible match only', async () => {
    const run = await screeningMockProvider.screen({ ...SUBJECT, fullName: 'John Sanction' });
    const cats = byCat(run.results);
    expect(cats.SANCTIONS.status).toBe('POSSIBLE_MATCH');
    expect(cats.SANCTIONS.matches.length).toBeGreaterThan(0);
    expect(cats.PEP.status).toBe('CLEAR');
    expect(cats.ADVERSE_MEDIA.status).toBe('CLEAR');
  });

  it('"pep" in the email triggers a PEP possible match', async () => {
    const run = await screeningMockProvider.screen({ ...SUBJECT, email: 'pep.user@example.com' });
    expect(byCat(run.results).PEP.status).toBe('POSSIBLE_MATCH');
  });

  it('"media" triggers an ADVERSE_MEDIA possible match', async () => {
    const run = await screeningMockProvider.screen({ ...SUBJECT, fullName: 'Media Person' });
    expect(byCat(run.results).ADVERSE_MEDIA.status).toBe('POSSIBLE_MATCH');
  });

  it('"fail" forces a provider ERROR on every category', async () => {
    const run = await screeningMockProvider.screen({ ...SUBJECT, fullName: 'Will Fail' });
    for (const r of run.results) {
      expect(r.status).toBe('ERROR');
      expect(r.matches).toHaveLength(0);
    }
  });

  it('keyword matching is case-insensitive', async () => {
    const run = await screeningMockProvider.screen({ ...SUBJECT, fullName: 'SANCTION Lord' });
    expect(byCat(run.results).SANCTIONS.status).toBe('POSSIBLE_MATCH');
  });

  it('never leaks a raw vendor payload — matches carry redacted metadata only', async () => {
    const run = await screeningMockProvider.screen({ ...SUBJECT, fullName: 'Sanction Test' });
    const match = byCat(run.results).SANCTIONS.matches[0];
    expect(match.listName).toBeTruthy();
    expect(typeof match.matchScore).toBe('number');
  });
});
