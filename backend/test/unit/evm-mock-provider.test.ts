import { describe, it, expect } from 'vitest';
import { createMockEvmProvider } from '../../src/modules/scanner/providers/evm.mock';
import type { TokenTransfer } from '../../src/modules/scanner/providers/chain.provider';

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

function transfer(over: Partial<TokenTransfer> = {}): Omit<TokenTransfer, 'blockHash'> {
  return {
    txHash: 'tx1',
    logIndex: 0,
    from: '0xfrom',
    to: '0xto',
    contract: USDT,
    amountBase: '1000000',
    blockNumber: 5n,
    ...over,
  };
}

describe('MockEvmProvider', () => {
  it('reports the chain id and mode', () => {
    const p = createMockEvmProvider('ETHEREUM', { head: 10n });
    expect(p.chain).toBe('ETHEREUM');
    expect(p.mode).toBe('mock');
    expect(p.name).toBe('evm-mock:ETHEREUM');
  });

  it('returns head + per-block identities and nothing beyond head', async () => {
    const p = createMockEvmProvider('BSC', { head: 10n });
    expect((await p.getLatestBlock()).number).toBe(10n);
    expect(await p.getBlock(3n)).toMatchObject({ number: 3n });
    expect(await p.getBlock(11n)).toBeNull();
    expect(await p.getBlock(-1n)).toBeNull();
  });

  it('filters token transfers by contract and inclusive block range', async () => {
    const p = createMockEvmProvider('ETHEREUM', { head: 10n });
    p.addTransfer(transfer({ txHash: 'a', blockNumber: 5n }));
    p.addTransfer(transfer({ txHash: 'b', blockNumber: 8n }));
    p.addTransfer(transfer({ txHash: 'c', blockNumber: 8n, contract: '0xother' }));

    const inRange = await p.getTokenTransfers({ contract: USDT, fromBlock: 4n, toBlock: 8n });
    expect(inRange.map((t) => t.txHash).sort()).toEqual(['a', 'b']);
    // Reported blockHash resolves from the current block hash.
    expect(inRange[0].blockHash).toBe('ethereum_block_5');

    const none = await p.getTokenTransfers({ contract: USDT, fromBlock: 0n, toBlock: 3n });
    expect(none).toHaveLength(0);
  });

  it('propagates a reorg via setBlockHash and supports removeTransfer', async () => {
    const p = createMockEvmProvider('ETHEREUM', { head: 10n });
    p.addTransfer(transfer({ txHash: 'a', blockNumber: 6n }));
    p.setBlockHash(6n, 'reorged_6');
    let got = await p.getTokenTransfers({ contract: USDT, fromBlock: 0n, toBlock: 10n });
    expect(got[0].blockHash).toBe('reorged_6');

    p.removeTransfer('a', 0);
    got = await p.getTokenTransfers({ contract: USDT, fromBlock: 0n, toBlock: 10n });
    expect(got).toHaveLength(0);
  });

  it('does not return transfers above the current head', async () => {
    const p = createMockEvmProvider('BSC', { head: 5n });
    p.addTransfer(transfer({ txHash: 'future', blockNumber: 9n }));
    const got = await p.getTokenTransfers({ contract: USDT, fromBlock: 0n, toBlock: 20n });
    expect(got).toHaveLength(0);
  });
});
