import { describe, it, expect } from 'vitest';
import { createMockTronProvider } from '../../src/modules/scanner/providers/tron.mock';

const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

describe('mock TRON provider', () => {
  it('reports the head and resolves blocks up to it', async () => {
    const p = createMockTronProvider({ head: 10n });
    expect((await p.getLatestBlock()).number).toBe(10n);
    expect(await p.getBlock(5n)).toEqual({ number: 5n, hash: 'tron_block_5' });
    expect(await p.getBlock(11n)).toBeNull(); // beyond head
  });

  it('returns TRC20 transfers filtered by contract and block range', async () => {
    const p = createMockTronProvider({ head: 10n });
    p.addTransfer({
      txHash: 'tx1',
      logIndex: 0,
      from: 'Tfrom',
      to: 'Tto',
      contract: USDT,
      amountBase: '1000000',
      blockNumber: 5n,
    });
    p.addTransfer({
      txHash: 'tx2',
      logIndex: 0,
      from: 'Tfrom',
      to: 'Tto',
      contract: 'OTHER',
      amountBase: '5',
      blockNumber: 5n,
    });

    const inRange = await p.getTrc20Transfers({
      contract: USDT,
      fromBlock: 0n,
      toBlock: 10n,
    });
    expect(inRange).toHaveLength(1);
    expect(inRange[0].txHash).toBe('tx1');
    expect(inRange[0].blockHash).toBe('tron_block_5');

    const outOfRange = await p.getTrc20Transfers({
      contract: USDT,
      fromBlock: 6n,
      toBlock: 10n,
    });
    expect(outOfRange).toHaveLength(0);
  });

  it('reflects a reorg: setBlockHash changes the reported block + transfer hash', async () => {
    const p = createMockTronProvider({ head: 10n });
    p.addTransfer({
      txHash: 'tx1',
      logIndex: 0,
      from: 'Tfrom',
      to: 'Tto',
      contract: USDT,
      amountBase: '1000000',
      blockNumber: 5n,
    });
    p.setBlockHash(5n, 'reorged_5');
    expect((await p.getBlock(5n))?.hash).toBe('reorged_5');
    const t = await p.getTrc20Transfers({ contract: USDT, fromBlock: 0n, toBlock: 10n });
    expect(t[0].blockHash).toBe('reorged_5');
  });

  it('removeTransfer simulates a tx vanishing in a reorg', async () => {
    const p = createMockTronProvider({ head: 10n });
    p.addTransfer({
      txHash: 'tx1',
      logIndex: 0,
      from: 'Tfrom',
      to: 'Tto',
      contract: USDT,
      amountBase: '1000000',
      blockNumber: 5n,
    });
    p.removeTransfer('tx1', 0);
    const t = await p.getTrc20Transfers({ contract: USDT, fromBlock: 0n, toBlock: 10n });
    expect(t).toHaveLength(0);
  });
});
