import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * KYC document storage provider tests (Stage 10B).
 *
 * The real `s3` provider is exercised against a fully mocked AWS SDK — no
 * network, no credentials, no real bucket is ever touched. These tests lock
 * in the safety invariants: opaque server-generated keys (the client can never
 * choose one), encryption always requested on PUT, short-lived presigned
 * URLs only (never a permanent/public link), and a loud failure when the
 * provider is selected without the config it needs.
 */

const { mockGetSignedUrl } = vi.hoisted(() => ({ mockGetSignedUrl: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {},
  PutObjectCommand: class {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  GetObjectCommand: class {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

import { config } from '../../src/config';
import { getKycStorageProvider } from '../../src/modules/kyc/storage';
import { kycStorageMockProvider } from '../../src/modules/kyc/storage/kyc-storage.mock';
import { kycStorageS3Provider } from '../../src/modules/kyc/storage/kyc-storage.s3';

const savedStorage = { ...config.kyc.storage };

afterEach(() => {
  Object.assign(config.kyc.storage, savedStorage);
  mockGetSignedUrl.mockReset();
});

describe('getKycStorageProvider (selector)', () => {
  it('defaults to the mock provider', () => {
    config.kyc.storage.provider = 'mock';
    expect(getKycStorageProvider()).toBe(kycStorageMockProvider);
  });

  it('selects the s3 provider when configured', () => {
    config.kyc.storage.provider = 's3';
    expect(getKycStorageProvider()).toBe(kycStorageS3Provider);
  });
});

describe('kycStorageMockProvider', () => {
  it('never actually resolves to a real host — bytes are never persisted', async () => {
    const target = await kycStorageMockProvider.createUploadTarget({
      userId: 'user-1',
      docType: 'PAN',
      contentType: 'image/png',
    });
    expect(target.uploadUrl).toContain('kyc-storage.mock.local');
    expect(target.requiredMethod).toBe('PUT');
  });

  it('generates an opaque, namespaced key with no PII', async () => {
    const target = await kycStorageMockProvider.createUploadTarget({
      userId: 'user-1',
      docType: 'AADHAAR',
      contentType: 'image/jpeg',
    });
    expect(target.storageKey).toMatch(/^kyc\/user-1\/aadhaar\/[0-9a-f-]{36}$/);
  });
});

describe('kycStorageS3Provider', () => {
  it('fails loudly rather than falling back to mock when bucket/region are absent', async () => {
    config.kyc.storage.provider = 's3';
    config.kyc.storage.bucket = undefined;
    config.kyc.storage.region = undefined;

    await expect(
      kycStorageS3Provider.createUploadTarget({
        userId: 'user-1',
        docType: 'PAN',
        contentType: 'image/png',
      }),
    ).rejects.toThrow(/KYC_S3_BUCKET/);
  });

  it('requests SSE-KMS with the configured CMK when present', async () => {
    config.kyc.storage.bucket = 'exora-kyc-docs';
    config.kyc.storage.region = 'ap-south-1';
    config.kyc.storage.kmsKeyId = 'arn:aws:kms:ap-south-1:123:key/abc';
    mockGetSignedUrl.mockResolvedValue('https://s3.example/presigned-put');

    const target = await kycStorageS3Provider.createUploadTarget({
      userId: 'user-2',
      docType: 'SELFIE',
      contentType: 'image/jpeg',
    });

    expect(target.uploadUrl).toBe('https://s3.example/presigned-put');
    expect(target.requiredHeaders['x-amz-server-side-encryption']).toBe('aws:kms');
    expect(target.requiredHeaders['x-amz-server-side-encryption-aws-kms-key-id']).toBe(
      'arn:aws:kms:ap-south-1:123:key/abc',
    );

    const [, command] = mockGetSignedUrl.mock.calls[0];
    expect(command.input.ServerSideEncryption).toBe('aws:kms');
    expect(command.input.SSEKMSKeyId).toBe('arn:aws:kms:ap-south-1:123:key/abc');
    // Never a client-supplied or PII-bearing key — always server-derived and opaque.
    expect(command.input.Key).toMatch(/^kyc\/user-2\/selfie\/[0-9a-f-]{36}$/);
  });

  it('falls back to SSE-S3 (AES256) when no CMK is configured', async () => {
    config.kyc.storage.bucket = 'exora-kyc-docs';
    config.kyc.storage.region = 'ap-south-1';
    config.kyc.storage.kmsKeyId = undefined;
    mockGetSignedUrl.mockResolvedValue('https://s3.example/presigned-put');

    const target = await kycStorageS3Provider.createUploadTarget({
      userId: 'user-3',
      docType: 'ADDRESS_PROOF',
      contentType: 'application/pdf',
    });

    expect(target.requiredHeaders['x-amz-server-side-encryption']).toBe('AES256');
    expect('x-amz-server-side-encryption-aws-kms-key-id' in target.requiredHeaders).toBe(false);
  });

  it('issues a short-lived presigned GET for admin review — never a permanent/public URL', async () => {
    config.kyc.storage.bucket = 'exora-kyc-docs';
    config.kyc.storage.region = 'ap-south-1';
    mockGetSignedUrl.mockResolvedValue('https://s3.example/presigned-get');

    const result = await kycStorageS3Provider.createReadUrl('kyc/user-1/pan/uuid');

    expect(result.url).toBe('https://s3.example/presigned-get');
    expect(result.expiresIn).toBeLessThanOrEqual(300);
    const [, command, opts] = mockGetSignedUrl.mock.calls[0];
    expect(command.input.Key).toBe('kyc/user-1/pan/uuid');
    expect(opts.expiresIn).toBeLessThanOrEqual(300);
  });

  it('fails loudly on read too when config is absent', async () => {
    config.kyc.storage.bucket = undefined;
    config.kyc.storage.region = undefined;

    await expect(kycStorageS3Provider.createReadUrl('kyc/user-1/pan/uuid')).rejects.toThrow(
      /KYC_S3_BUCKET/,
    );
  });
});
