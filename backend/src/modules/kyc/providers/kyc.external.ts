import type { KycProvider } from './kyc-provider';

/**
 * External (real vendor) KYC provider — STUB.
 *
 * Intentionally unimplemented until a vendor is finalized and credentials are
 * received (Phase 3). Every method fails loudly rather than silently degrading,
 * so selecting `KYC_PROVIDER=external` before the integration exists can never
 * be reached by accident in a custodial flow.
 *
 * Phase 3 will replace these throwing bodies with the chosen vendor's client
 * (session creation, document submission, status polling) and a webhook
 * signature verifier matching that vendor's signing scheme.
 */
const NOT_IMPLEMENTED =
  'External KYC provider is not implemented yet; set KYC_PROVIDER=mock until a vendor is configured';

export const kycExternalProvider: KycProvider = {
  name: 'kyc-external',

  async createKycSession() {
    throw new Error(NOT_IMPLEMENTED);
  },

  async submitDocuments() {
    throw new Error(NOT_IMPLEMENTED);
  },

  async getStatus() {
    throw new Error(NOT_IMPLEMENTED);
  },

  async verifyWebhook() {
    throw new Error(NOT_IMPLEMENTED);
  },
};
