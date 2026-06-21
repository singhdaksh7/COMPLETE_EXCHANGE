import { config } from '../../../config';
import { screeningMockProvider } from './screening.mock';
import type { ComplianceScreeningProvider } from './screening-provider';

/**
 * Resolve the active screening provider from SCREENING_PROVIDER (Stage 5.1).
 *
 * Only the offline mock is implemented today. A future real vendor is selected
 * here by branching on config.compliance.screeningProvider; until one is wired,
 * any non-mock value falls back to the mock so a custodial onboarding flow can
 * never silently depend on a half-built vendor client.
 */
export function getScreeningProvider(): ComplianceScreeningProvider {
  switch (config.compliance.screeningProvider) {
    case 'mock':
    default:
      return screeningMockProvider;
  }
}

export type {
  ComplianceScreeningProvider,
  ScreeningSubject,
  ScreeningRunResult,
  ScreeningCategoryResult,
  ScreeningProviderMatch,
} from './screening-provider';
export { SCREENING_CATEGORIES } from './screening-provider';
