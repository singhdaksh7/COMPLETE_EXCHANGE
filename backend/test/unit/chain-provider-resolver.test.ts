import { describe, it, expect, afterEach } from 'vitest';
import {
  getChainProvider,
  getTronProvider,
  resetTronProvider,
} from '../../src/modules/scanner/providers';

/**
 * Provider resolver (Phase 5.1). TRON keeps its existing resolver; ETHEREUM/BSC
 * default to the offline EVM mock; 'live' EVM is refused (never hits real RPC).
 */
describe('getChainProvider resolver', () => {
  afterEach(() => resetTronProvider());

  it('resolves TRON to the TRON provider (mock by default)', () => {
    const p = getChainProvider('TRON');
    expect(p.chain).toBe('TRON');
    expect(p.mode).toBe('mock');
    expect(p).toBe(getTronProvider()); // same memoized instance
  });

  it('resolves ETHEREUM + BSC to the EVM mock', () => {
    const eth = getChainProvider('ETHEREUM');
    expect(eth.chain).toBe('ETHEREUM');
    expect(eth.mode).toBe('mock');
    expect(eth.name).toContain('evm-mock');

    const bsc = getChainProvider('bsc'); // case-insensitive
    expect(bsc.chain).toBe('BSC');
    expect(bsc.mode).toBe('mock');
  });

  it('memoizes per chain', () => {
    expect(getChainProvider('ETHEREUM')).toBe(getChainProvider('ETHEREUM'));
    expect(getChainProvider('ETHEREUM')).not.toBe(getChainProvider('BSC'));
  });

  it('throws on an unsupported chain', () => {
    expect(() => getChainProvider('DOGE')).toThrow(/Unsupported chain/i);
  });
});
