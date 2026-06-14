import { createHash } from 'node:crypto';
import type {
  AddressDerivationProvider,
  DeriveAddressInput,
  DerivedAddress,
} from './address-derivation.provider';

/**
 * Mock address-derivation provider.
 *
 * Fully offline and deterministic: the address is a pure function of
 * (chain, derivationIndex), so the same index always yields the same address
 * and tests are reproducible. It performs NO network calls and handles NO
 * private keys — it only fabricates a plausibly-shaped PUBLIC address:
 *   - EVM chains (ETHEREUM/BSC) → '0x' + 40 hex chars
 *   - TRON                      → 'T'  + 33 base58 chars
 *
 * These are format-shaped placeholders for development; they are never used to
 * receive real funds and are never validated against a live network here.
 */
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function toBase58(bytes: Buffer, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += BASE58[bytes[i % bytes.length] % BASE58.length];
  }
  return out;
}

export const mockAddressDerivationProvider: AddressDerivationProvider = {
  name: 'address-derivation-mock',

  async deriveAddress(input: DeriveAddressInput): Promise<DerivedAddress> {
    const seed = createHash('sha256')
      .update(`${input.chain}:${input.derivationIndex.toString()}`)
      .digest();

    if (input.family === 'TRON') {
      return { address: `T${toBase58(seed, 33)}` };
    }
    // EVM family (ETHEREUM / BSC): 20-byte hex address.
    return { address: `0x${seed.subarray(0, 20).toString('hex')}` };
  },
};
