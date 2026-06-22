import { config } from '../../../config';
import { walletRiskMockProvider } from './wallet-risk.mock';
import type { WalletRiskProviderClient } from './wallet-risk-provider';

/**
 * Resolve the active wallet-risk provider from WALLET_RISK_PROVIDER (Stage 5.3).
 *
 * Only the offline mock is implemented today. A future real chain-analytics
 * vendor is selected here by branching on config.compliance.walletRisk.provider;
 * until one is wired, any non-mock value falls back to the mock so the compliance
 * flow can never silently depend on a half-built (or paid) vendor client.
 */
export function getWalletRiskProvider(): WalletRiskProviderClient {
  switch (config.compliance.walletRisk.provider) {
    case 'mock':
    default:
      return walletRiskMockProvider;
  }
}

export type {
  WalletRiskProviderClient,
  WalletRiskSubject,
  WalletRiskAssessment,
} from './wallet-risk-provider';
