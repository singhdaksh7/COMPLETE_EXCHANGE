import { describe, it, expect } from 'vitest';
import { mockAddressDerivationProvider } from '../../src/modules/wallet/providers/address-derivation.mock';

const provider = mockAddressDerivationProvider;

describe('mock address derivation provider', () => {
  it('derives an EVM-shaped address for ETHEREUM/BSC', async () => {
    const eth = await provider.deriveAddress({
      chain: 'ETHEREUM',
      family: 'EVM',
      derivationIndex: 0n,
    });
    expect(eth.address).toMatch(/^0x[0-9a-f]{40}$/);

    const bsc = await provider.deriveAddress({
      chain: 'BSC',
      family: 'EVM',
      derivationIndex: 0n,
    });
    expect(bsc.address).toMatch(/^0x[0-9a-f]{40}$/);
    // Different chains at the same index produce different addresses.
    expect(bsc.address).not.toBe(eth.address);
  });

  it('derives a TRON base58-shaped address', async () => {
    const tron = await provider.deriveAddress({
      chain: 'TRON',
      family: 'TRON',
      derivationIndex: 0n,
    });
    expect(tron.address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it('is deterministic: same chain + index → same address', async () => {
    const a = await provider.deriveAddress({
      chain: 'TRON',
      family: 'TRON',
      derivationIndex: 7n,
    });
    const b = await provider.deriveAddress({
      chain: 'TRON',
      family: 'TRON',
      derivationIndex: 7n,
    });
    expect(a.address).toBe(b.address);
  });

  it('different indices on the same chain → different addresses', async () => {
    const a = await provider.deriveAddress({
      chain: 'ETHEREUM',
      family: 'EVM',
      derivationIndex: 1n,
    });
    const b = await provider.deriveAddress({
      chain: 'ETHEREUM',
      family: 'EVM',
      derivationIndex: 2n,
    });
    expect(a.address).not.toBe(b.address);
  });

  it('never returns key material — only an address field', async () => {
    const out = await provider.deriveAddress({
      chain: 'TRON',
      family: 'TRON',
      derivationIndex: 0n,
    });
    expect(Object.keys(out)).toEqual(['address']);
  });
});
