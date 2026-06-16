import { describe, it, expect } from 'vitest';
import { createLiveEvmProvider } from '../../src/modules/scanner/providers/evm.live';

/**
 * LiveEvmProvider config validation (Phase 5.2). The provider is read-only and
 * must refuse to construct without an RPC URL — this is the config-error guard
 * the resolver relies on when ETH_PROVIDER/BSC_PROVIDER=live. No network calls
 * are made here (construction validates config only).
 */
describe('createLiveEvmProvider config validation', () => {
  it('throws when the RPC URL is missing/empty (ETHEREUM)', () => {
    expect(() => createLiveEvmProvider({ chain: 'ETHEREUM', rpcUrl: undefined })).toThrow(/ETH_RPC_URL/);
    expect(() => createLiveEvmProvider({ chain: 'ETHEREUM', rpcUrl: '' })).toThrow(/ETH_RPC_URL/);
  });

  it('throws when the RPC URL is missing (BSC)', () => {
    expect(() => createLiveEvmProvider({ chain: 'BSC', rpcUrl: null })).toThrow(/BSC_RPC_URL/);
  });

  it('constructs a read-only provider when an RPC URL is present', () => {
    const p = createLiveEvmProvider({ chain: 'ETHEREUM', rpcUrl: 'https://rpc.example/eth' });
    expect(p.chain).toBe('ETHEREUM');
    expect(p.mode).toBe('live');
    expect(p.name).toBe('evm-live:ETHEREUM');
    // Read-only surface only — no sign/broadcast methods exist on the provider.
    expect('signTransfer' in p).toBe(false);
    expect('broadcast' in p).toBe(false);
    expect(typeof p.getLatestBlock).toBe('function');
    expect(typeof p.getTokenTransfers).toBe('function');
  });
});
