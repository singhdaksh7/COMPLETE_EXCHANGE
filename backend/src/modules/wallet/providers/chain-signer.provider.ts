/**
 * Chain-signer abstraction.
 *
 * The signer registry (`chain_signers`) records, per chain, a reference to a
 * key held in an external KMS/HSM — `kmsKeyRef` is a HANDLE, never the key
 * material. This abstraction is the seam a future withdrawal module will use to
 * obtain signatures.
 *
 * SCOPE: this module provides READ support only. Signing is intentionally NOT
 * implemented yet (withdrawals are a later module), and private keys are never
 * stored in or returned by this service.
 */

/** Public, safe view of a signer — no secret material, only a KMS handle. */
export interface ChainSignerRef {
  id: string;
  chain: string;
  name: string;
  /** Opaque KMS/HSM key reference — NEVER the private key itself. */
  kmsKeyRef: string;
  publicKey: string | null;
  status: string;
}

export interface ChainSignerProvider {
  /** Human-readable implementation name. */
  readonly name: string;

  /** Resolve the active signer abstraction for a chain (read-only). */
  getActiveSigner(chain: string): Promise<ChainSignerRef | null>;

  /**
   * Signing is unavailable in this module. The method exists to document the
   * seam; calling it throws so a withdrawal cannot accidentally be signed here.
   */
  sign(): Promise<never>;
}

export interface ChainSignerProviderDeps {
  findActiveSigner(chain: string): Promise<ChainSignerRef | null>;
}

/**
 * DB-backed signer provider. Resolution is delegated to an injected reader
 * (the repository) so the provider stays unit-testable and free of a direct
 * Prisma dependency.
 */
export function createChainSignerProvider(
  deps: ChainSignerProviderDeps,
): ChainSignerProvider {
  return {
    name: 'chain-signer-db',
    getActiveSigner(chain: string): Promise<ChainSignerRef | null> {
      return deps.findActiveSigner(chain);
    },
    sign(): Promise<never> {
      return Promise.reject(
        new Error('Chain signing is not implemented in the wallet module'),
      );
    },
  };
}
