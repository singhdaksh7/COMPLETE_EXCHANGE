import { describe, it, expect } from 'vitest';
import { createMockWithdrawalSigner } from '../../src/modules/withdrawal/providers/withdrawal-signer.mock';

const baseInput = {
  chain: 'TRON',
  asset: 'USDT',
  contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  fromAddress: 'Thotwallet',
  toAddress: 'Tuserdest',
  amountBase: '9000000',
  signer: { id: 's1', kmsKeyRef: 'kms://tron/1', publicKey: '0xpub' },
};

describe('mock withdrawal signer', () => {
  it('produces a deterministic tx hash bound to (fromAddress, nonce)', async () => {
    const s = createMockWithdrawalSigner();
    const a = await s.signTransfer({ ...baseInput, nonce: 0n });
    const b = await s.signTransfer({ ...baseInput, nonce: 0n });
    const c = await s.signTransfer({ ...baseInput, nonce: 1n });
    expect(a.txHash).toBe(b.txHash); // same nonce → same hash (idempotent)
    expect(a.txHash).not.toBe(c.txHash); // different nonce → different hash
    expect(a.txHash).toMatch(/^trxw_/);
  });

  it('never returns key material', async () => {
    const s = createMockWithdrawalSigner();
    const signed = await s.signTransfer({ ...baseInput, nonce: 0n });
    expect(JSON.stringify(signed)).not.toMatch(/privatekey|secret|kms/i);
  });

  it('broadcast is idempotent and confirmations start at 0', async () => {
    const s = createMockWithdrawalSigner();
    const signed = await s.signTransfer({ ...baseInput, nonce: 0n });
    const r1 = await s.broadcast({ chain: 'TRON', signedTx: signed });
    const r2 = await s.broadcast({ chain: 'TRON', signedTx: signed });
    expect(r1.txHash).toBe(r2.txHash);
    const conf = await s.getConfirmations({ chain: 'TRON', txHash: signed.txHash });
    expect(conf).toEqual({ found: true, confirmations: 0, success: true });
  });

  it('reports not-found for an unknown tx', async () => {
    const s = createMockWithdrawalSigner();
    const conf = await s.getConfirmations({ chain: 'TRON', txHash: 'nope' });
    expect(conf.found).toBe(false);
  });

  it('test controls drive confirmation depth and failure', async () => {
    const s = createMockWithdrawalSigner();
    const signed = await s.signTransfer({ ...baseInput, nonce: 0n });
    await s.broadcast({ chain: 'TRON', signedTx: signed });
    s.confirm(signed.txHash, 20);
    expect((await s.getConfirmations({ chain: 'TRON', txHash: signed.txHash })).confirmations).toBe(20);
    s.failTx(signed.txHash);
    expect((await s.getConfirmations({ chain: 'TRON', txHash: signed.txHash })).success).toBe(false);
  });
});
