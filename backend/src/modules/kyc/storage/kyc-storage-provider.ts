import type { KycDocType } from '@prisma/client';

/** Target the client uploads document bytes to (never persisted verbatim). */
export interface KycUploadTarget {
  storageKey: string;
  uploadUrl: string;
  requiredMethod: 'PUT';
  /** Headers the client MUST send on the PUT for the signature to validate. */
  requiredHeaders: Record<string, string>;
  expiresIn: number;
}

export interface KycReadTarget {
  url: string;
  expiresIn: number;
}

/**
 * Vendor-neutral abstraction over KYC document object storage. Mirrors the
 * identity-verification `KycProvider` pattern (`../providers/kyc-provider.ts`)
 * — a `mock` implementation for staging/test, a real implementation gated
 * behind explicit config, selected by `KYC_STORAGE_PROVIDER`.
 *
 * The provider NEVER receives document bytes itself — it only issues
 * short-lived presigned URLs the client uses to talk to storage directly.
 */
export interface KycStorageProvider {
  readonly name: string;

  /** Build an opaque storage key + short-lived presigned PUT for one document. */
  createUploadTarget(input: {
    userId: string;
    docType: KycDocType;
    contentType: string;
  }): Promise<KycUploadTarget>;

  /** Short-lived presigned GET for admin review. Never a permanent/public URL. */
  createReadUrl(storageKey: string): Promise<KycReadTarget>;
}
