import { config } from '../../../config';
import { kycStorageMockProvider } from './kyc-storage.mock';
import { kycStorageS3Provider } from './kyc-storage.s3';
import type { KycStorageProvider } from './kyc-storage-provider';

/**
 * Resolve the active KYC document storage provider from `KYC_STORAGE_PROVIDER`.
 *
 *   mock — deterministic, offline, non-routable stand-in (default). Document
 *          bytes are never actually persisted anywhere in this mode.
 *   s3   — real private object storage. Requires `KYC_S3_BUCKET` +
 *          `KYC_S3_REGION`/`AWS_REGION`; throws loudly if absent rather than
 *          silently falling back to mock.
 *
 * Mirrors the identity-provider selector (`../providers/index.ts`).
 */
export function getKycStorageProvider(): KycStorageProvider {
  return config.kyc.storage.provider === 's3' ? kycStorageS3Provider : kycStorageMockProvider;
}

export type { KycStorageProvider, KycUploadTarget, KycReadTarget } from './kyc-storage-provider';
