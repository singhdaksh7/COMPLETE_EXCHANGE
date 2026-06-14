import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/wallet/wallet.repository', () => ({
  walletRepository: {
    tx: vi.fn(async (fn) => fn({})),
    findActiveChain: vi.fn(),
    listSupportedNetworks: vi.fn(),
    chainHasSupportedAsset: vi.fn(),
    findActiveAddress: vi.fn(),
    listUserAddresses: vi.fn(),
    nextDerivationIndex: vi.fn(),
    createAddress: vi.fn(),
    listHotWallets: vi.fn(),
    getWalletNonce: vi.fn(),
    listChainSigners: vi.fn(),
    findActiveSigner: vi.fn(),
    adminListDepositAddresses: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/modules/ledger/ledger.service', () => ({
  ledgerService: { listWallets: vi.fn() },
}));

vi.mock('../../src/modules/wallet/providers', () => ({
  getAddressDerivationProvider: () => ({
    name: 'address-derivation-mock',
    deriveAddress: vi.fn(async () => ({ address: 'Tnewaddress' })),
  }),
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { walletRepository } from '../../src/modules/wallet/wallet.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { walletService } from '../../src/modules/wallet/wallet.service';

const repo = vi.mocked(walletRepository);
const ledger = vi.mocked(ledgerService);

const USER_ID = '11111111-1111-4111-8111-111111111111';

function addr(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    userId: USER_ID,
    chain: 'TRON',
    address: 'Texisting',
    derivationIndex: 0n,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.tx.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
});

describe('walletService.getOverview', () => {
  it('builds the overview from LEDGER balances + networks + addresses', async () => {
    ledger.listWallets.mockResolvedValue([
      { asset: 'USDT', available: '10', locked: '0', total: '10' },
    ]);
    repo.listSupportedNetworks.mockResolvedValue([
      {
        asset: 'USDT',
        chain: 'TRON',
        contractAddr: 'TR7NHq...',
        decimals: 6,
        minConfirmations: 20,
        chainRef: { family: 'TRON' },
      },
      {
        asset: 'USDT',
        chain: 'ETHEREUM',
        contractAddr: '0xdAC1...',
        decimals: 6,
        minConfirmations: 12,
        chainRef: { family: 'EVM' },
      },
    ] as never);
    repo.listUserAddresses.mockResolvedValue([
      addr({ chain: 'TRON', address: 'Tmyaddr', isActive: true }),
    ]);

    const out = await walletService.getOverview(USER_ID);

    expect(out.balances).toHaveLength(1);
    expect(out.assets).toHaveLength(1);
    const usdt = out.assets[0];
    expect(usdt.asset).toBe('USDT');
    expect(usdt.available).toBe('10'); // from ledger, not on-chain
    expect(usdt.networks).toHaveLength(2);
    const tron = usdt.networks.find((n) => n.chain === 'TRON');
    expect(tron?.depositAddress).toBe('Tmyaddr');
    const eth = usdt.networks.find((n) => n.chain === 'ETHEREUM');
    expect(eth?.depositAddress).toBeNull(); // no address derived yet
  });

  it('defaults balance to zero when the user has no ledger account for the asset', async () => {
    ledger.listWallets.mockResolvedValue([]);
    repo.listSupportedNetworks.mockResolvedValue([
      {
        asset: 'USDT',
        chain: 'BSC',
        contractAddr: '0x55d3...',
        decimals: 18,
        minConfirmations: 15,
        chainRef: { family: 'EVM' },
      },
    ] as never);
    repo.listUserAddresses.mockResolvedValue([]);

    const out = await walletService.getOverview(USER_ID);
    expect(out.assets[0].available).toBe('0');
    expect(out.assets[0].total).toBe('0');
  });
});

describe('walletService.requestDepositAddress', () => {
  beforeEach(() => {
    repo.findActiveChain.mockResolvedValue({
      id: 'TRON',
      name: 'TRON',
      family: 'TRON',
      nativeAsset: 'TRX',
      evmChainId: null,
      confirmations: 20,
      reorgBuffer: 32,
      isActive: true,
      createdAt: new Date(),
    } as never);
    repo.chainHasSupportedAsset.mockResolvedValue(true);
  });

  it('returns the existing ACTIVE address without deriving a new one', async () => {
    repo.findActiveAddress.mockResolvedValue(addr({ address: 'Texisting' }));

    const result = await walletService.requestDepositAddress(USER_ID, 'TRON');

    expect(result.created).toBe(false);
    expect(result.address.address).toBe('Texisting');
    expect(repo.tx).not.toHaveBeenCalled();
    expect(repo.createAddress).not.toHaveBeenCalled();
  });

  it('derives and assigns a new address when none is active', async () => {
    repo.findActiveAddress.mockResolvedValue(null); // both fast-path and in-tx
    repo.nextDerivationIndex.mockResolvedValue(5n);
    repo.createAddress.mockResolvedValue(
      addr({ id: 'addr-new', address: 'Tnewaddress', derivationIndex: 5n }),
    );

    const result = await walletService.requestDepositAddress(USER_ID, 'TRON');

    expect(result.created).toBe(true);
    expect(result.address.address).toBe('Tnewaddress');
    expect(repo.createAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        chain: 'TRON',
        address: 'Tnewaddress',
        derivationIndex: 5n,
      }),
      expect.anything(),
    );
  });

  it('rejects an unsupported / inactive chain', async () => {
    repo.findActiveChain.mockResolvedValue(null);
    await expect(
      walletService.requestDepositAddress(USER_ID, 'DOGE'),
    ).rejects.toMatchObject({ errorCode: 'CHAIN_NOT_SUPPORTED' });
    expect(repo.tx).not.toHaveBeenCalled();
  });

  it('rejects a chain with no depositable assets', async () => {
    repo.findActiveAddress.mockResolvedValue(null);
    repo.chainHasSupportedAsset.mockResolvedValue(false);
    await expect(
      walletService.requestDepositAddress(USER_ID, 'TRON'),
    ).rejects.toMatchObject({ errorCode: 'CHAIN_NOT_SUPPORTED' });
  });
});

describe('walletService admin reads', () => {
  it('lists hot wallets with signer ref + nonce (no key material)', async () => {
    repo.listHotWallets.mockResolvedValue([
      {
        id: 'hw-1',
        chain: 'TRON',
        address: 'Thotwallet',
        tier: 'HOT',
        label: 'primary',
        isActive: true,
        signer: {
          id: 'sg-1',
          chain: 'TRON',
          name: 'tron-signer',
          kmsKeyRef: 'kms://tron/1',
          publicKey: '0xpub',
          status: 'ACTIVE',
          createdAt: new Date(),
        },
        nonce: { hotWalletId: 'hw-1', nextNonce: 42n, updatedAt: new Date() },
      },
    ] as never);

    const items = await walletService.adminListHotWallets(
      { chain: 'TRON' },
      { actorId: 'admin-1' },
    );
    expect(items[0].signer?.kmsKeyRef).toBe('kms://tron/1');
    expect(items[0].nonce?.nextNonce).toBe('42');
    // The DTO must not leak private key material.
    expect(JSON.stringify(items[0])).not.toMatch(/privateKey|secret/i);
    expect(repo.writeAdminLog).toHaveBeenCalled();
  });

  it('lists chain signers as key-free references', async () => {
    repo.listChainSigners.mockResolvedValue([
      {
        id: 'sg-1',
        chain: 'ETHEREUM',
        name: 'eth-signer',
        kmsKeyRef: 'kms://eth/1',
        publicKey: '0xpub',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ] as never);

    const items = await walletService.adminListSigners(
      {},
      { actorId: 'admin-1' },
    );
    expect(items[0].kmsKeyRef).toBe('kms://eth/1');
    expect(repo.writeAdminLog).toHaveBeenCalled();
  });
});
