import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../../config';
import type { KycStorageProvider } from './kyc-storage-provider';

/**
 * Real private-object-storage provider (S3-compatible).
 *
 * - Private bucket, no public-read ACL is ever set here (bucket-level Block
 *   Public Access must be enabled at the infra layer — see
 *   `docs/security/kms-readiness.md` conventions; this code never uploads a
 *   public ACL regardless of bucket config).
 * - Server-side encryption is always requested: KMS (customer-managed key,
 *   `KYC_S3_KMS_KEY_ID`) when configured, otherwise SSE-S3 (`AES256`) so
 *   objects are never written unencrypted.
 * - Object keys are opaque (`kyc/<userId-uuid>/<docType>/<uuid>`) — never
 *   email/phone/PAN/Aadhaar/name. `userId` here is already an opaque UUID
 *   primary key, not a human identifier.
 * - Presigned PUT/GET URLs are short-lived and generated server-side only;
 *   this provider never returns a permanent or public document URL, and never
 *   allows the client to choose its own object key.
 *
 * Fails LOUD at construction if required config is absent — it must never
 * silently degrade to an unencrypted or misconfigured upload target in a
 * custodial financial system.
 */
function requireConfig(): { bucket: string; region: string; kmsKeyId?: string } {
  const { bucket, region, kmsKeyId } = config.kyc.storage;
  if (!bucket || !region) {
    throw new Error(
      'KYC_STORAGE_PROVIDER=s3 requires KYC_S3_BUCKET and KYC_S3_REGION (or AWS_REGION) to be set. ' +
        'Refusing to start with a real-storage provider selected but no bucket configured — ' +
        'this must fail loudly rather than silently fall back to the mock host.',
    );
  }
  return { bucket, region, kmsKeyId };
}

let cachedClient: S3Client | null = null;
function client(region: string): S3Client {
  if (!cachedClient) cachedClient = new S3Client({ region });
  return cachedClient;
}

export const kycStorageS3Provider: KycStorageProvider = {
  name: 's3',

  async createUploadTarget(input) {
    const { bucket, region, kmsKeyId } = requireConfig();
    const storageKey = `kyc/${input.userId}/${input.docType.toLowerCase()}/${randomUUID()}`;
    const ttlSec = config.kyc.uploadUrlTtlSec;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: input.contentType,
      ServerSideEncryption: kmsKeyId ? 'aws:kms' : 'AES256',
      ...(kmsKeyId ? { SSEKMSKeyId: kmsKeyId } : {}),
    });
    const uploadUrl = await getSignedUrl(client(region), command, { expiresIn: ttlSec });

    // These headers are part of what was signed above — the client MUST send
    // exactly these on the PUT or the presigned signature will not validate.
    const requiredHeaders: Record<string, string> = {
      'Content-Type': input.contentType,
      'x-amz-server-side-encryption': kmsKeyId ? 'aws:kms' : 'AES256',
      ...(kmsKeyId ? { 'x-amz-server-side-encryption-aws-kms-key-id': kmsKeyId } : {}),
    };

    return { storageKey, uploadUrl, requiredMethod: 'PUT', requiredHeaders, expiresIn: ttlSec };
  },

  async createReadUrl(storageKey) {
    const { bucket, region } = requireConfig();
    const ttlSec = 300; // short-lived — admin review only, never a standing link
    const command = new GetObjectCommand({ Bucket: bucket, Key: storageKey });
    const url = await getSignedUrl(client(region), command, { expiresIn: ttlSec });
    return { url, expiresIn: ttlSec };
  },
};
