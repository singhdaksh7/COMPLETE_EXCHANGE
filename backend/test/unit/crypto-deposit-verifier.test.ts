import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  evaluateEvmReceipt,
  findMasterTransfer,
  formatUnits,
  evmVerifier,
} from '../../src/modules/crypto-deposit/verification/evm.verifier';
import { submitCryptoDepositSchema } from '../../src/modules/crypto-deposit/crypto-deposit.validators';
import type { ResolvedNetwork } from '../../src/modules/crypto-deposit/crypto-deposit.config';

const TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const MASTER = `0x${'11'.repeat(20)}`;
const CONTRACT = `0x${'22'.repeat(20)}`;
const FROM = `0x${'33'.repeat(20)}`;
const OTHER = `0x${'44'.repeat(20)}`;

function word(addr: string): string {
  return `0x${'0'.repeat(24)}${addr.slice(2).toLowerCase()}`;
}
function transferLog(
  contract: string,
  from: string,
  to: string,
  dataHex: string,
  logIndex = '0x0',
) {
  return { address: contract, topics: [TOPIC, word(from), word(to)], data: dataHex, logIndex };
}
// 1 USDT at 6 decimals.
const ONE_USDT_6 = '0x0f4240'; // 1_000_000

function network(over: Partial<ResolvedNetwork> = {}): ResolvedNetwork {
  return {
    chain: 'BSC',
    family: 'EVM',
    networkName: 'BNB Smart Chain (BEP20)',
    assetSymbol: 'USDT',
    decimals: 6,
    masterAddress: MASTER,
    tokenContract: CONTRACT,
    minConfirmations: 15,
    rpcUrl: 'http://rpc.local',
    apiUrl: null,
    apiKey: null,
    ...over,
  };
}

describe('formatUnits', () => {
  it('formats base units to a human decimal string', () => {
    expect(formatUnits(1_000_000n, 6)).toBe('1');
    expect(formatUnits(1_500_000n, 6)).toBe('1.5');
    expect(formatUnits(0n, 6)).toBe('0');
    // BEP20 USDT uses 18 decimals.
    expect(formatUnits(1_000_000_000_000_000_000n, 18)).toBe('1');
  });
});

describe('findMasterTransfer', () => {
  it('returns the transfer to the master from the configured contract', () => {
    const t = findMasterTransfer([transferLog(CONTRACT, FROM, MASTER, ONE_USDT_6)], CONTRACT, MASTER);
    expect(t).not.toBeNull();
    expect(t?.value).toBe(1_000_000n);
    expect(t?.from).toBe(FROM.toLowerCase());
  });

  it('ignores transfers from a different contract', () => {
    const t = findMasterTransfer([transferLog(OTHER, FROM, MASTER, ONE_USDT_6)], CONTRACT, MASTER);
    expect(t).toBeNull();
  });

  it('ignores transfers to a different recipient', () => {
    const t = findMasterTransfer([transferLog(CONTRACT, FROM, OTHER, ONE_USDT_6)], CONTRACT, MASTER);
    expect(t).toBeNull();
  });
});

describe('evaluateEvmReceipt', () => {
  const net = network();

  it('CONFIRMED when valid + enough confirmations', () => {
    const receipt = { status: '0x1', blockNumber: '0x10', logs: [transferLog(CONTRACT, FROM, MASTER, ONE_USDT_6)] };
    const res = evaluateEvmReceipt(receipt, 0x10n + 15n, net);
    expect(res.outcome).toBe('CONFIRMED');
    expect(res.amount).toBe('1');
    expect(res.confirmations).toBe(15);
    expect(res.fromAddress).toBe(FROM.toLowerCase());
  });

  it('PENDING when below required confirmations', () => {
    const receipt = { status: '0x1', blockNumber: '0x10', logs: [transferLog(CONTRACT, FROM, MASTER, ONE_USDT_6)] };
    const res = evaluateEvmReceipt(receipt, 0x10n + 2n, net);
    expect(res.outcome).toBe('PENDING');
    expect(res.confirmations).toBe(2);
  });

  it('REJECTED when the token contract does not match', () => {
    const receipt = { status: '0x1', blockNumber: '0x10', logs: [transferLog(OTHER, FROM, MASTER, ONE_USDT_6)] };
    expect(evaluateEvmReceipt(receipt, 0x100n, net).outcome).toBe('REJECTED');
  });

  it('REJECTED when the recipient is not the master wallet', () => {
    const receipt = { status: '0x1', blockNumber: '0x10', logs: [transferLog(CONTRACT, FROM, OTHER, ONE_USDT_6)] };
    expect(evaluateEvmReceipt(receipt, 0x100n, net).outcome).toBe('REJECTED');
  });

  it('REJECTED on a zero amount', () => {
    const receipt = { status: '0x1', blockNumber: '0x10', logs: [transferLog(CONTRACT, FROM, MASTER, '0x0')] };
    const res = evaluateEvmReceipt(receipt, 0x100n, net);
    expect(res.outcome).toBe('REJECTED');
    expect(res.reason).toBe('zero_amount');
  });

  it('REJECTED on a reverted transaction', () => {
    const receipt = { status: '0x0', blockNumber: '0x10', logs: [transferLog(CONTRACT, FROM, MASTER, ONE_USDT_6)] };
    expect(evaluateEvmReceipt(receipt, 0x100n, net).outcome).toBe('REJECTED');
  });

  it('PENDING when the tx is not found yet (null receipt)', () => {
    expect(evaluateEvmReceipt(null, 0x100n, net).outcome).toBe('PENDING');
  });
});

describe('evmVerifier.verifyTx provider handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PROVIDER_NOT_CONFIGURED when the network lacks an RPC URL', async () => {
    const res = await evmVerifier.verifyTx({
      chain: 'BSC',
      txHash: `0x${'ab'.repeat(32)}`,
      network: network({ rpcUrl: null }),
    });
    expect(res.outcome).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('PROVIDER_ERROR (never throws) when the RPC call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('econn')));
    const res = await evmVerifier.verifyTx({
      chain: 'BSC',
      txHash: `0x${'ab'.repeat(32)}`,
      network: network(),
    });
    expect(res.outcome).toBe('PROVIDER_ERROR');
  });
});

describe('submitCryptoDepositSchema (tx-hash validation)', () => {
  it('rejects a malformed EVM tx hash', () => {
    const r = submitCryptoDepositSchema.safeParse({ assetSymbol: 'USDT', chain: 'BSC', txHash: 'not-a-hash' });
    expect(r.success).toBe(false);
  });

  it('accepts a valid EVM tx hash', () => {
    const r = submitCryptoDepositSchema.safeParse({
      assetSymbol: 'USDT',
      chain: 'ETH',
      txHash: `0x${'ab'.repeat(32)}`,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a bare 64-hex TRON tx id but rejects a 0x-prefixed one', () => {
    expect(
      submitCryptoDepositSchema.safeParse({ assetSymbol: 'USDT', chain: 'TRON', txHash: 'ab'.repeat(32) }).success,
    ).toBe(true);
    expect(
      submitCryptoDepositSchema.safeParse({ assetSymbol: 'USDT', chain: 'TRON', txHash: `0x${'ab'.repeat(32)}` }).success,
    ).toBe(false);
  });

  it('rejects a non-USDT asset', () => {
    const r = submitCryptoDepositSchema.safeParse({ assetSymbol: 'BTC', chain: 'BSC', txHash: `0x${'ab'.repeat(32)}` });
    expect(r.success).toBe(false);
  });
});
