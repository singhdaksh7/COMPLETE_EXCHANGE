/**
 * testnet:provision-wallets
 *
 * Provisions the custody rows needed for a testnet end-to-end run on the target
 * EVM chain (TESTNET_CHAIN), idempotently:
 *
 *   - HOT wallet  : address derived from TESTNET_EVM_PRIVATE_KEY. The DB stores
 *                   ONLY the env-handle (chain_signers.kms_key_ref) + the public
 *                   address — never the key material.
 *   - COLD wallet : address from TESTNET_EVM_COLD_ADDRESS (public only). Used for
 *                   treasury sweep/refill accounting; no key is held here.
 *   - demo user   : ACTIVE + KYC APPROVED tier 1, with a fresh deposit address
 *                   (its throwaway key is discarded — we only ever receive to it)
 *                   and an allowlisted external withdrawal destination.
 *
 * SECURITY: no private key is ever printed or written to Postgres. The hot key
 * stays in env/Secrets Manager; the deposit address key is discarded in-memory.
 *
 * Usage:
 *   CHAIN_ENV=testnet TESTNET_CHAIN=BSC npm run testnet:provision-wallets
 */
import { hash } from '@node-rs/argon2';
import { getAddress, Wallet } from 'ethers';
import { ASSET, hotWallet, log, prisma, targetChain } from './_shared';
import { config } from '../../src/config';

const NATIVE: Record<string, string> = { BSC: 'BNB', ETHEREUM: 'ETH' };

/**
 * Idempotent provisioning. Safe to run any number of times: every row is
 * resolved with an upsert (on a PLAIN unique/PK index) or a findFirst +
 * create/update (for the two PARTIAL-index models, users + withdrawal_addresses,
 * where ON CONFLICT is not inferrable → 42P10). Exported for test coverage.
 */
export async function provisionWallets(): Promise<Record<string, unknown>> {
  const chain = targetChain();
  const hot = hotWallet(chain);
  const hotAddress = getAddress(hot.address);

  const coldRaw = config.testnet.evmColdAddress;
  if (!coldRaw) throw new Error('TESTNET_EVM_COLD_ADDRESS is required (public address)');
  const coldAddress = getAddress(coldRaw);

  // ---- chain + asset + asset_chain baseline (asset_chain contract set by deploy) ----
  await prisma.asset.upsert({
    where: { symbol: ASSET },
    update: {},
    create: { symbol: ASSET, name: 'Tether USD', kind: 'CRYPTO', decimals: 6 },
  });
  await prisma.asset.upsert({
    where: { symbol: NATIVE[chain] },
    update: {},
    create: { symbol: NATIVE[chain], name: NATIVE[chain], kind: 'CRYPTO', decimals: 18 },
  });
  await prisma.chain.upsert({
    where: { id: chain },
    update: { isActive: true },
    create: {
      id: chain,
      name: chain,
      family: 'EVM',
      nativeAsset: NATIVE[chain],
      evmChainId: config.testnet.chainIds[chain],
      confirmations: 3,
    },
  });

  // ---- HOT wallet (env-handle key ref only) ----
  // Make our hot wallet the deterministic active pick for this chain.
  await prisma.hotWallet.updateMany({
    where: { chain, tier: 'HOT', isActive: true, NOT: { address: hotAddress } },
    data: { isActive: false },
  });
  const hotSigner = await prisma.chainSigner.upsert({
    where: { chain_kmsKeyRef: { chain, kmsKeyRef: config.testnet.evmKeyRef } },
    update: { publicKey: hotAddress, status: 'ACTIVE' },
    create: {
      chain,
      name: `testnet-hot-${chain}`,
      kmsKeyRef: config.testnet.evmKeyRef, // HANDLE only — never key material
      publicKey: hotAddress,
      status: 'ACTIVE',
    },
  });
  const hotWalletRow = await prisma.hotWallet.upsert({
    where: { chain_address: { chain, address: hotAddress } },
    update: { isActive: true, tier: 'HOT', signerId: hotSigner.id },
    create: { chain, signerId: hotSigner.id, address: hotAddress, tier: 'HOT', label: 'testnet-hot', isActive: true },
  });
  await prisma.walletNonce.upsert({
    where: { hotWalletId: hotWalletRow.id },
    update: {},
    create: { hotWalletId: hotWalletRow.id, nextNonce: 0 },
  });

  // ---- COLD wallet (public address only; accounting) ----
  const coldKeyRef = 'TESTNET_EVM_COLD_ADDRESS';
  const coldSigner = await prisma.chainSigner.upsert({
    where: { chain_kmsKeyRef: { chain, kmsKeyRef: coldKeyRef } },
    update: { publicKey: coldAddress, status: 'ACTIVE' },
    create: { chain, name: `testnet-cold-${chain}`, kmsKeyRef: coldKeyRef, publicKey: coldAddress, status: 'ACTIVE' },
  });
  const coldWalletRow = await prisma.hotWallet.upsert({
    where: { chain_address: { chain, address: coldAddress } },
    update: { isActive: true, tier: 'COLD', signerId: coldSigner.id },
    create: { chain, signerId: coldSigner.id, address: coldAddress, tier: 'COLD', label: 'testnet-cold', isActive: true },
  });

  // ---- demo user + deposit address + withdrawal destination ----
  // NOTE: `users.email` is backed by a PARTIAL unique index
  // (`users_email_active_key ON users(email) WHERE deleted_at IS NULL`), so a
  // Prisma upsert keyed on email emits `ON CONFLICT (email)` which Postgres
  // cannot match → error 42P10. Same trap for withdrawal_addresses. We use a
  // findFirst (active rows only) + create/update instead, which is idempotent and
  // never touches production auth behaviour or DB constraints.
  const email = `testnet-demo-${chain.toLowerCase()}@example.com`;
  const existingUser = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          status: 'ACTIVE',
          kycStatus: 'APPROVED',
          kycTier: 1,
          emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash: await hash('Testnet-Demo-Passw0rd!'),
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
          kycStatus: 'APPROVED',
          kycTier: 1,
        },
      });

  let deposit = await prisma.depositAddress.findFirst({
    where: { userId: user.id, chain, isActive: true },
  });
  if (!deposit) {
    // Throwaway receive-only address; its key is discarded immediately (we never
    // spend from it in the demo — funds are minted here only to prove detection).
    const depAddress = getAddress(Wallet.createRandom().address);
    deposit = await prisma.depositAddress.create({
      data: { userId: user.id, chain, address: depAddress, derivationIndex: BigInt(Date.now()), isActive: true },
    });
  }

  // External destination the user withdraws to (throwaway; observe on explorer).
  // Reuse the existing active testnet-dest so re-runs are idempotent (the unique
  // index here is also partial: WHERE deleted_at IS NULL — no ON CONFLICT).
  const passedCooldown = new Date(Date.now() - 1000);
  let dest = await prisma.withdrawalAddress.findFirst({
    where: { userId: user.id, chain, label: 'testnet-dest', deletedAt: null },
  });
  if (dest) {
    dest = await prisma.withdrawalAddress.update({
      where: { id: dest.id },
      data: { whitelistedAt: passedCooldown },
    });
  } else {
    const destAddress = getAddress(Wallet.createRandom().address);
    dest = await prisma.withdrawalAddress.create({
      data: { userId: user.id, chain, address: destAddress, label: 'testnet-dest', whitelistedAt: passedCooldown },
    });
  }

  const summary = {
    chain,
    hotWallet: hotAddress,
    coldWallet: coldAddress,
    demoUserId: user.id,
    demoEmail: email,
    depositAddress: deposit.address,
    withdrawalDestination: dest.address,
    hotWalletId: hotWalletRow.id,
    coldWalletId: coldWalletRow.id,
  };
  log('provision:done', summary);
  log('provision:NEXT', {
    fund: 'npm run testnet:fund-demo',
    note: 'Fund the HOT wallet with native gas (tBNB/SepoliaETH) from a faucet before withdrawing.',
  });
  return summary;
}

// Run as a CLI only when invoked directly (not when imported by a test).
if (require.main === module) {
  provisionWallets()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error('provision-wallets failed:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
