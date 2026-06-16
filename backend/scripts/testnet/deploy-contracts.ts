/**
 * testnet:deploy-contracts
 *
 * Compiles contracts/MockUSDT.sol and deploys it to the target EVM testnet
 * (TESTNET_CHAIN = BSC | ETHEREUM), then records the contract address into
 * asset_chains.contract_addr for (USDT, <chain>) with testnet-friendly
 * confirmations so the scanner credits quickly.
 *
 * Usage (operator machine, testnet .env loaded):
 *   CHAIN_ENV=testnet TESTNET_CHAIN=BSC npm run testnet:deploy-contracts
 *
 * Requires: TESTNET_EVM_PRIVATE_KEY (hot/deployer key) in env, funded with the
 * chain's native gas token (tBNB / SepoliaETH).
 *
 * TRON note: TRON Nile/Shasta deployment is a documented manual step (deploy
 * MockUSDT via TronBox/tronweb and set TRON_TESTNET_USDT_CONTRACT) — see
 * docs/TESTNET_E2E.md. This script handles the EVM testnets only.
 */
import { ContractFactory } from 'ethers';
import {
  ASSET,
  compileMockUsdt,
  hotWallet,
  log,
  prisma,
  targetChain,
} from './_shared';

const MIN_CONFIRMATIONS = 3; // testnet: shallow but non-zero

async function main(): Promise<void> {
  const chain = targetChain();
  const wallet = hotWallet(chain);
  log('deploy:start', { chain, deployer: wallet.address });

  const { abi, bytecode } = compileMockUsdt();
  const factory = new ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  log('deploy:done', { chain, contract: address });

  // Point the scanner + withdrawal token resolution at the new contract.
  await prisma.assetChain.upsert({
    where: { asset_chain: { asset: ASSET, chain } },
    update: { contractAddr: address, decimals: 6, minConfirmations: MIN_CONFIRMATIONS, isActive: true },
    create: {
      asset: ASSET,
      chain,
      contractAddr: address,
      decimals: 6,
      minConfirmations: MIN_CONFIRMATIONS,
      isActive: true,
    },
  });

  log('deploy:asset_chain_updated', {
    asset: ASSET,
    chain,
    contractAddr: address,
    minConfirmations: MIN_CONFIRMATIONS,
  });
  log('deploy:NEXT', {
    setEnv:
      chain === 'BSC'
        ? `BSC_TESTNET_USDT_CONTRACT=${address}`
        : `ETH_SEPOLIA_USDT_CONTRACT=${address}`,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('deploy-contracts failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
