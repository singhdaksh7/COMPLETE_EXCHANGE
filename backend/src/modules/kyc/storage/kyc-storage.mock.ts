import { randomUUID } from 'node:crypto';
import { config } from '../../../config';
import type { KycStorageProvider } from './kyc-storage-provider';

/**
 * STUB storage provider — deterministic, offline, non-routable. The host
 * (`kyc-storage.mock.local`) can never accidentally resolve to a real bucket,
 * so document bytes are never actually persisted anywhere in this mode. This
 * is the default in dev/test and MUST NOT be selected in a real staging/prod
 * environment handling real customer documents (see `kyc-storage.s3.ts`).
 */
export const kycStorageMockProvider: KycStorageProvider = {
  name: 'mock',

  async createUploadTarget(input) {
    const storageKey = `kyc/${input.userId}/${input.docType.toLowerCase()}/${randomUUID()}`;
    const ttlSec = config.kyc.uploadUrlTtlSec;
    const expires = Math.floor(Date.now() / 1000) + ttlSec;
    const params = new URLSearchParams({ contentType: input.contentType, expires: String(expires) });
    return {
      storageKey,
      uploadUrl: `https://kyc-storage.mock.local/${storageKey}?${params.toString()}`,
      requiredMethod: 'PUT',
      requiredHeaders: { 'Content-Type': input.contentType },
      expiresIn: ttlSec,
    };
  },

  async createReadUrl(storageKey) {
    const ttlSec = 300;
    return {
      url: `https://kyc-storage.mock.local/${storageKey}?expires=${Math.floor(Date.now() / 1000) + ttlSec}`,
      expiresIn: ttlSec,
    };
  },
};
