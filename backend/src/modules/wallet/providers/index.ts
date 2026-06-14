import { walletRepository } from '../wallet.repository';
import { mockAddressDerivationProvider } from './address-derivation.mock';
import {
  createChainSignerProvider,
  type ChainSignerProvider,
} from './chain-signer.provider';
import type { AddressDerivationProvider } from './address-derivation.provider';

/**
 * Resolve the active address-derivation provider.
 *
 * Only the offline mock exists today (per the module brief: "use mock address
 * derivation provider for now"). A real HD/KMS-backed deriver is a future task;
 * the seam is this function so nothing else changes when it lands.
 */
export function getAddressDerivationProvider(): AddressDerivationProvider {
  return mockAddressDerivationProvider;
}

let signerProvider: ChainSignerProvider | undefined;

/** Resolve the chain-signer abstraction (DB-backed reads; no signing). */
export function getChainSignerProvider(): ChainSignerProvider {
  if (!signerProvider) {
    signerProvider = createChainSignerProvider({
      findActiveSigner: (chain) => walletRepository.findActiveSigner(chain),
    });
  }
  return signerProvider;
}

export type {
  AddressDerivationProvider,
  DeriveAddressInput,
  DerivedAddress,
} from './address-derivation.provider';
export type {
  ChainSignerProvider,
  ChainSignerRef,
} from './chain-signer.provider';
