import { config } from '../../../config';
import { mockDigiLockerProvider } from './digilocker.mock';
import type { DigiLockerProvider } from './digilocker.provider';

/**
 * Resolve the active DigiLocker provider.
 *
 * Today only the offline mock exists. Selecting the 'real' provider fails loudly
 * rather than silently degrading — wiring a real client is a future task and
 * must never be reached by accident in a custodial flow.
 */
export function getDigiLockerProvider(): DigiLockerProvider {
  if (config.kyc.digiLockerProvider === 'real') {
    throw new Error(
      'Real DigiLocker provider is not implemented yet; set KYC_DIGILOCKER_PROVIDER=mock',
    );
  }
  return mockDigiLockerProvider;
}

export type {
  DigiLockerProvider,
  DigiLockerSession,
  DigiLockerIssuedDocument,
} from './digilocker.provider';
