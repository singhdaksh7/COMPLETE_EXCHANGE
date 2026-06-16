import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 5.6 — provision-wallets must be idempotent (safe to run twice).
 *
 * We mock the script's data layer (`./_shared`) and `config` so the control flow
 * is exercised WITHOUT a database. The fake `prisma` returns "not found" on the
 * first run and the previously-created row on the second, letting us assert:
 *   - the demo user / deposit address / withdrawal destination are CREATED once
 *     and UPDATED (not recreated) on rerun;
 *   - the two partial-index models are never touched via `upsert` (the fake has
 *     no `.upsert` for them — a regression would throw);
 *   - hot/cold custody rows use upsert (idempotent by construction);
 *   - both runs return the SAME identifiers.
 */

// Hoisted so the (also-hoisted) vi.mock factories can reference them safely.
const { COLD, HOT } = vi.hoisted(() => ({
  COLD: `0x${'2'.repeat(40)}`,
  HOT: `0x${'1'.repeat(40)}`,
}));

// --- stateful fake prisma -----------------------------------------------------
const state = vi.hoisted(() => ({
  user: null as null | { id: string; emailVerifiedAt: Date | null },
  deposit: null as null | { id: string; address: string },
  dest: null as null | { id: string; address: string },
}));

const calls = vi.hoisted(() => ({
  userCreate: 0,
  userUpdate: 0,
  depositCreate: 0,
  destCreate: 0,
  destUpdate: 0,
}));

vi.mock('../../scripts/testnet/_shared', () => {
  const prisma = {
    asset: { upsert: vi.fn(async () => ({})) },
    chain: { upsert: vi.fn(async () => ({})) },
    chainSigner: { upsert: vi.fn(async () => ({ id: 'signer-1' })) },
    hotWallet: {
      upsert: vi.fn(async ({ create }: { create: { tier: string } }) => ({
        id: create.tier === 'COLD' ? 'cold-1' : 'hot-1',
      })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    walletNonce: { upsert: vi.fn(async () => ({})) },
    user: {
      findFirst: vi.fn(async () => state.user),
      create: vi.fn(async ({ data }: { data: { emailVerifiedAt: Date } }) => {
        calls.userCreate += 1;
        state.user = { id: 'user-1', emailVerifiedAt: data.emailVerifiedAt };
        return state.user;
      }),
      update: vi.fn(async () => {
        calls.userUpdate += 1;
        return state.user;
      }),
    },
    depositAddress: {
      findFirst: vi.fn(async () => state.deposit),
      create: vi.fn(async ({ data }: { data: { address: string } }) => {
        calls.depositCreate += 1;
        state.deposit = { id: 'dep-1', address: data.address };
        return state.deposit;
      }),
    },
    withdrawalAddress: {
      findFirst: vi.fn(async () => state.dest),
      create: vi.fn(async ({ data }: { data: { address: string } }) => {
        calls.destCreate += 1;
        state.dest = { id: 'dest-1', address: data.address };
        return state.dest;
      }),
      update: vi.fn(async () => {
        calls.destUpdate += 1;
        return state.dest;
      }),
    },
    $disconnect: vi.fn(async () => undefined),
  };
  return {
    ASSET: 'USDT',
    targetChain: () => 'BSC',
    hotWallet: () => ({ address: HOT }),
    log: vi.fn(),
    prisma,
  };
});

vi.mock('../../src/config', () => ({
  config: {
    isTestnet: true,
    testnet: {
      evmColdAddress: COLD,
      evmKeyRef: 'TESTNET_EVM_PRIVATE_KEY',
      chainIds: { BSC: 97, ETHEREUM: 11155111 },
    },
  },
}));

import { provisionWallets } from '../../scripts/testnet/provision-wallets';

describe('provision-wallets is idempotent (run twice)', () => {
  beforeEach(() => {
    state.user = null;
    state.deposit = null;
    state.dest = null;
    calls.userCreate = 0;
    calls.userUpdate = 0;
    calls.depositCreate = 0;
    calls.destCreate = 0;
    calls.destUpdate = 0;
  });

  it('creates on the first run and updates (never recreates) on the second', async () => {
    const first = await provisionWallets();
    const second = await provisionWallets();

    // Stable identifiers across runs → genuinely idempotent.
    expect(second.demoUserId).toBe(first.demoUserId);
    expect(second.depositAddress).toBe(first.depositAddress);
    expect(second.withdrawalDestination).toBe(first.withdrawalDestination);

    // The partial-index rows are created exactly once, then updated/reused.
    expect(calls.userCreate).toBe(1);
    expect(calls.userUpdate).toBe(1);
    expect(calls.depositCreate).toBe(1); // findFirst reuses on the 2nd run
    expect(calls.destCreate).toBe(1);
    expect(calls.destUpdate).toBe(1);
  });

  it('does not throw on a fresh provision', async () => {
    await expect(provisionWallets()).resolves.toMatchObject({ chain: 'BSC' });
  });
});
