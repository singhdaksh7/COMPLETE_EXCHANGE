import type { ChainFamily } from '@prisma/client';

/**
 * Address-derivation provider abstraction.
 *
 * This is the seam between the wallet module and whatever actually produces a
 * deposit address for a chain — today an offline deterministic mock, later an
 * HD-wallet / KMS-backed derivation service. The rest of the module codes
 * against this interface so the implementation is swappable.
 *
 * HARD RULE: a derivation provider returns ONLY the public address. It MUST
 * NEVER return, log, or persist private key material — keys live in an
 * HSM/KMS, never in this service or the database.
 */
export interface DerivedAddress {
  /** The public on-chain deposit address. */
  address: string;
}

export interface DeriveAddressInput {
  /** Chain id (e.g. 'TRON', 'ETHEREUM', 'BSC'). */
  chain: string;
  /** Chain family — drives the address format (EVM hex vs TRON base58). */
  family: ChainFamily;
  /** Global per-chain HD derivation index (unique per chain). */
  derivationIndex: bigint;
}

export interface AddressDerivationProvider {
  /** Human-readable implementation name (e.g. 'address-derivation-mock'). */
  readonly name: string;

  /** Derive the deposit address for a chain at a given derivation index. */
  deriveAddress(input: DeriveAddressInput): Promise<DerivedAddress>;
}
