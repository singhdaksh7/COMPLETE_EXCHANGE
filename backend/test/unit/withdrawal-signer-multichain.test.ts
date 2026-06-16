import { describe, it, expect } from 'vitest';
import { createMockWithdrawalSigner } from '../../src/modules/withdrawal/providers/withdrawal-signer.mock';

/**
 * The withdrawal signer/broadcaster seam is already chain-generic (every method
 * takes `chain`). This proves the mock signs + broadcasts EVM (Ethereum/BSC)
 * transfers, so the multi-chain withdrawal broadcast foundation works without
 * any real keys — TRON's existing flow is unchanged.
 */
const signer = (chain: string) => ({
  chain,
  asset: 'USDT',
  contract: chain === 'TRON' ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  fromAddress: chain === 'TRON' ? 'Thot' : '0xhot',
  toAddress: chain === 'TRON' ? 'Tdest' : '0xdest',
  amountBase: '1000000',
  signer: { id: 's1', kmsKeyRef: 'kms://mock/key', publicKey: null },
});

describe('mock withdrawal signer — multi-chain', () => {
  it('signs + broadcasts ERC20 (Ethereum) and BEP20 (BSC) transfers', async () => {
    const s = createMockWithdrawalSigner();
    for (const chain of ['ETHEREUM', 'BSC']) {
      const signed = await s.signTransfer({ ...signer(chain), nonce: 0n });
      expect(signed.txHash).toBeTruthy();
      expect(signed.rawTx).toBeTruthy();
      const result = await s.broadcast({ chain, signedTx: signed });
      expect(result.txHash).toBe(signed.txHash);
      const conf = await s.getConfirmations({ chain, txHash: signed.txHash });
      expect(conf.found).toBe(true);
    }
  });

  it('keeps signatures idempotent per (fromAddress, nonce) regardless of chain', async () => {
    const s = createMockWithdrawalSigner();
    const a = await s.signTransfer({ ...signer('ETHEREUM'), nonce: 7n });
    const b = await s.signTransfer({ ...signer('ETHEREUM'), nonce: 7n });
    const c = await s.signTransfer({ ...signer('ETHEREUM'), nonce: 8n });
    expect(a.txHash).toBe(b.txHash); // same nonce → same deterministic hash
    expect(a.txHash).not.toBe(c.txHash);
  });

  it('never holds key material — only a kmsKeyRef handle crosses the seam', async () => {
    const s = createMockWithdrawalSigner();
    const signed = await s.signTransfer({ ...signer('BSC'), nonce: 0n });
    expect(JSON.stringify(signed)).not.toMatch(/privateKey|mnemonic|secret/i);
  });
});
