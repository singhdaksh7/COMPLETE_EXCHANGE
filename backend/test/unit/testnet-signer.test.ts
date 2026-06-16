import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 5.6 — testnet-local withdrawal signer fail-closed gating.
 *
 * The signer must REFUSE to exist unless CHAIN_ENV=testnet AND
 * ALLOW_TESTNET_SIGNING=YES. We mock the app config so we can assert each gate
 * independently without touching real env or the network.
 */
const state = vi.hoisted(() => ({
  isTestnet: false,
  allowSigning: false,
}));

vi.mock('../../src/config', () => ({
  config: {
    get isTestnet() {
      return state.isTestnet;
    },
    testnet: {
      get allowSigning() {
        return state.allowSigning;
      },
      evmKeyRef: 'TESTNET_EVM_PRIVATE_KEY',
      chainIds: { BSC: 97, ETHEREUM: 11155111 },
      rpcUrl: { BSC: 'https://example.invalid', ETHEREUM: 'https://example.invalid' },
    },
  },
}));

// Logger is imported transitively by the signer; stub it to stay quiet.
vi.mock('../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createTestnetLocalSigner } from '../../src/modules/withdrawal/providers/withdrawal-signer.testnet-local';

describe('testnet-local signer fail-closed gating', () => {
  beforeEach(() => {
    state.isTestnet = false;
    state.allowSigning = false;
  });

  it('throws when CHAIN_ENV is not testnet', () => {
    state.isTestnet = false;
    state.allowSigning = true;
    expect(() => createTestnetLocalSigner()).toThrow(/CHAIN_ENV=testnet/i);
  });

  it('throws when ALLOW_TESTNET_SIGNING is not YES', () => {
    state.isTestnet = true;
    state.allowSigning = false;
    expect(() => createTestnetLocalSigner()).toThrow(/ALLOW_TESTNET_SIGNING=YES/i);
  });

  it('constructs only when both gates pass (no network until sign)', () => {
    state.isTestnet = true;
    state.allowSigning = true;
    const signer = createTestnetLocalSigner();
    expect(signer.mode).toBe('live');
    expect(signer.name).toBe('withdrawal-signer-testnet-local');
  });

  it('refuses non-EVM chains at sign time', async () => {
    state.isTestnet = true;
    state.allowSigning = true;
    const signer = createTestnetLocalSigner();
    await expect(
      signer.signTransfer({
        chain: 'TRON',
        asset: 'USDT',
        contract: 'Txxx',
        fromAddress: '0x0000000000000000000000000000000000000001',
        toAddress: '0x0000000000000000000000000000000000000002',
        amountBase: '1000000',
        nonce: 0n,
        signer: { id: 'h', kmsKeyRef: 'TESTNET_EVM_PRIVATE_KEY', publicKey: null },
      }),
    ).rejects.toThrow(/EVM chains only/i);
  });
});
