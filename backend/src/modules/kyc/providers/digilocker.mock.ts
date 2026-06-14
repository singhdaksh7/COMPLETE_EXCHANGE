import { createHash, randomUUID } from 'node:crypto';
import type { KycDocType } from '@prisma/client';
import type {
  DigiLockerIssuedDocument,
  DigiLockerProvider,
  DigiLockerSession,
} from './digilocker.provider';

/**
 * Mock DigiLocker provider.
 *
 * Deterministic, fully offline stand-in for the real DigiLocker API. It performs
 * NO network calls and fabricates no PII: sessions are opaque references and
 * "issued documents" are reduced to secure storage keys + content hashes, which
 * is exactly the shape a real client would persist (we never store the raw
 * document bytes' contents, PAN, or Aadhaar here).
 *
 * A non-routable host (`*.mock.local`) is used for the authorization URL so it
 * can never accidentally hit a real endpoint.
 */
const CONSENT_BASE_URL = 'https://digilocker.mock.local/consent';
const SESSION_TTL_SEC = 600;

export const mockDigiLockerProvider: DigiLockerProvider = {
  name: 'digilocker-mock',

  async createSession({ userId }): Promise<DigiLockerSession> {
    // userId is bound into the ref so a fetch can be attributed, without
    // embedding any PII in the opaque token.
    const providerRef = `dl_${createHash('sha256')
      .update(`${userId}:${randomUUID()}`)
      .digest('hex')
      .slice(0, 24)}`;
    return {
      provider: 'digilocker',
      providerRef,
      authorizationUrl: `${CONSENT_BASE_URL}/${providerRef}`,
      expiresIn: SESSION_TTL_SEC,
    };
  },

  async fetchIssuedDocuments({
    providerRef,
  }): Promise<DigiLockerIssuedDocument[]> {
    const make = (docType: KycDocType): DigiLockerIssuedDocument => ({
      docType,
      // Secure storage key — opaque, namespaced, never a public URL.
      storageKey: `kyc/digilocker/${providerRef}/${docType.toLowerCase()}`,
      sha256: createHash('sha256')
        .update(`${providerRef}:${docType}`)
        .digest('hex'),
    });
    // A real DigiLocker pull would return the documents the user consented to;
    // the mock yields a stable PAN + Aadhaar pair.
    return [make('PAN'), make('AADHAAR')];
  },
};
