import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/modules/legal/legal.repository', () => ({
  legalRepository: { listAcceptancesForUser: vi.fn() },
}));

import { legalRepository } from '../../src/modules/legal/legal.repository';
import {
  REQUIRED_SIGNUP_POLICIES,
  missingRequiredPolicies,
  requireLegalConsent,
  isConsentEnforced,
} from '../../src/modules/legal/legal.consent';

const repo = vi.mocked(legalRepository);
const USER = 'user-1';

function acc(documentType: string, over: Record<string, unknown> = {}) {
  return { documentType, status: 'ACCEPTED', revokedAt: null, ...over } as never;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete process.env.REQUIRE_POLICY_CONSENT;
});

describe('legal consent gate', () => {
  it('reports all required policies missing when none accepted', async () => {
    repo.listAcceptancesForUser.mockResolvedValue([]);
    const missing = await missingRequiredPolicies(USER);
    expect(missing).toEqual(REQUIRED_SIGNUP_POLICIES);
  });

  it('reports none missing once all required policies are accepted', async () => {
    repo.listAcceptancesForUser.mockResolvedValue(
      REQUIRED_SIGNUP_POLICIES.map((t) => acc(t)),
    );
    expect(await missingRequiredPolicies(USER)).toEqual([]);
  });

  it('ignores revoked / non-ACCEPTED acceptances', async () => {
    repo.listAcceptancesForUser.mockResolvedValue([
      acc('TERMS_OF_SERVICE'),
      acc('PRIVACY_POLICY', { revokedAt: new Date() }),
      acc('RISK_DISCLOSURE', { status: 'REVOKED' }),
    ]);
    const missing = await missingRequiredPolicies(USER);
    expect(missing).toContain('PRIVACY_POLICY');
    expect(missing).toContain('RISK_DISCLOSURE');
    expect(missing).not.toContain('TERMS_OF_SERVICE');
  });

  it('middleware blocks with CONSENT_REQUIRED when a policy is missing', async () => {
    repo.listAcceptancesForUser.mockResolvedValue([acc('TERMS_OF_SERVICE')]);
    const next = vi.fn();
    await requireLegalConsent({ user: { id: USER } } as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ errorCode: 'CONSENT_REQUIRED' });
  });

  it('middleware passes when all required policies are accepted', async () => {
    repo.listAcceptancesForUser.mockResolvedValue(
      REQUIRED_SIGNUP_POLICIES.map((t) => acc(t)),
    );
    const next = vi.fn();
    await requireLegalConsent({ user: { id: USER } } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('middleware is a no-op when enforcement is disabled', async () => {
    process.env.REQUIRE_POLICY_CONSENT = 'false';
    expect(isConsentEnforced()).toBe(false);
    const next = vi.fn();
    await requireLegalConsent({} as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();
    expect(repo.listAcceptancesForUser).not.toHaveBeenCalled();
  });
});
