import type {
  WalletRiskAssessment,
  WalletRiskProviderClient,
  WalletRiskSubject,
} from './wallet-risk-provider';

/**
 * Deterministic offline wallet-risk provider (Stage 5.3). NO real chain
 * analytics — outcome is derived purely from substrings in the address so
 * staging/demo and tests are fully reproducible:
 *
 *   contains 'block' -> CRITICAL / BLOCKED
 *   contains 'risk'  -> HIGH / REVIEW_REQUIRED
 *   contains 'watch' -> MEDIUM / REVIEW_REQUIRED
 *   contains 'fail'  -> throws (simulated provider failure -> FAILED check)
 *   otherwise        -> LOW / CLEAR
 */
export const walletRiskMockProvider: WalletRiskProviderClient = {
  name: 'wallet-risk-mock',
  mode: 'mock',

  async screen(subject: WalletRiskSubject): Promise<WalletRiskAssessment> {
    const addr = subject.address.toLowerCase();

    if (addr.includes('fail')) {
      throw new Error('wallet-risk mock: simulated provider failure');
    }

    if (addr.includes('block')) {
      return {
        provider: this.name,
        mode: 'mock',
        level: 'CRITICAL',
        status: 'BLOCKED',
        score: 95,
        summary: 'Mock: address matches a blocked/sanctioned cluster.',
        categories: ['sanctions', 'blocked_entity'],
      };
    }

    if (addr.includes('risk')) {
      return {
        provider: this.name,
        mode: 'mock',
        level: 'HIGH',
        status: 'REVIEW_REQUIRED',
        score: 75,
        summary: 'Mock: address linked to high-risk activity; manual review advised.',
        categories: ['high_risk_exposure'],
      };
    }

    if (addr.includes('watch')) {
      return {
        provider: this.name,
        mode: 'mock',
        level: 'MEDIUM',
        status: 'REVIEW_REQUIRED',
        score: 45,
        summary: 'Mock: address has moderate-risk indirect exposure.',
        categories: ['indirect_exposure'],
      };
    }

    return {
      provider: this.name,
      mode: 'mock',
      level: 'LOW',
      status: 'CLEAR',
      score: 5,
      summary: 'Mock: no risk indicators found.',
      categories: [],
    };
  },
};
