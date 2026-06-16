/**
 * testnet:fund-demo
 *
 * Mints MockUSDT (owner = deployer = hot key) on the target EVM testnet to:
 *   - the demo user's deposit address  → triggers a real deposit detection
 *   - the HOT wallet                   → on-chain liquidity for the withdrawal
 *
 * In a real exchange the hot wallet is funded by SWEEPING deposits; for a demo
 * we mint directly so the withdrawal has on-chain balance without a sweep step.
 *
 * Usage:
 *   CHAIN_ENV=testnet TESTNET_CHAIN=BSC npm run testnet:fund-demo
 *
 * Env: TESTNET_FUND_DEPOSIT (default 200), TESTNET_FUND_HOT (default 500).
 */
import { Contract, getAddress } from 'ethers';
import {
  ASSET,
  compileMockUsdt,
  explorer,
  hotWallet,
  log,
  prisma,
  targetChain,
  toBaseUnits,
} from './_shared';
import { config } from '../../src/config';

async function main(): Promise<void> {
  const chain = targetChain();
  const wallet = hotWallet(chain);
  const hotAddress = getAddress(wallet.address);

  const token =
    config.testnet.usdtContract[chain] ??
    (await prisma.assetChain.findUnique({ where: { asset_chain: { asset: ASSET, chain } } }))?.contractAddr ??
    undefined;
  if (!token) throw new Error(`No MockUSDT contract for ${chain}; run testnet:deploy-contracts first`);

  const demo = await prisma.user.findUniqueOrThrow({
    where: { email: `testnet-demo-${chain.toLowerCase()}@example.com` },
    include: { deposits: false },
  });
  const deposit = await prisma.depositAddress.findFirstOrThrow({
    where: { userId: demo.id, chain, isActive: true },
  });

  const { abi } = compileMockUsdt();
  const contract = new Contract(getAddress(token), abi, wallet);

  const depAmt = process.env.TESTNET_FUND_DEPOSIT ?? '200';
  const hotAmt = process.env.TESTNET_FUND_HOT ?? '500';

  const tx1 = await contract.mint(getAddress(deposit.address), toBaseUnits(depAmt));
  await tx1.wait();
  const tx2 = await contract.mint(hotAddress, toBaseUnits(hotAmt));
  await tx2.wait();

  log('fund:done', {
    chain,
    contract: token,
    depositAddress: deposit.address,
    depositMinted: depAmt,
    depositTx: explorer(chain, tx1.hash),
    hotWallet: hotAddress,
    hotMinted: hotAmt,
    hotTx: explorer(chain, tx2.hash),
  });
  log('fund:NEXT', { run: 'npm run testnet:e2e' });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('fund-demo failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
