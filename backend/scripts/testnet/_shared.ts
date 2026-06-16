/**
 * Shared helpers for the Phase 5.6 testnet operator scripts.
 *
 * These scripts run via tsx on an OPERATOR machine (never inside the API image)
 * against real public testnets. They reuse the validated app `config` for chain
 * ids / RPC urls / contract addresses and the env-handle for the hot key.
 *
 * SECURITY: the private key is read ONLY from process.env[config.testnet.evmKeyRef].
 * It is never written to disk, never logged, never stored in Postgres.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { JsonRpcProvider, Wallet } from 'ethers';
// solc ships no types; it is a build-time tool only used by these scripts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import solc from 'solc';
import { config } from '../../src/config';

export const prisma = new PrismaClient();

export const ASSET = 'USDT';

/** The EVM testnet chain these scripts target ('BSC' | 'ETHEREUM'). */
export function targetChain(): string {
  return config.testnet.chain;
}

export function requireRpc(chain: string): string {
  const url = config.testnet.rpcUrl[chain];
  if (!url) {
    throw new Error(
      `No testnet RPC url for ${chain}. Set ${chain === 'BSC' ? 'BSC_TESTNET_RPC_URL' : 'ETH_SEPOLIA_RPC_URL'}.`,
    );
  }
  return url;
}

export function chainId(chain: string): number {
  const id = config.testnet.chainIds[chain];
  if (!id) throw new Error(`No testnet chain id for ${chain}`);
  return id;
}

export function provider(chain: string): JsonRpcProvider {
  return new JsonRpcProvider(requireRpc(chain), chainId(chain));
}

/** Build the hot-wallet signer from the env-handle key. Never logs the key. */
export function hotWallet(chain: string): Wallet {
  const pk = process.env[config.testnet.evmKeyRef];
  if (!pk) {
    throw new Error(
      `Hot key not found in env handle '${config.testnet.evmKeyRef}'. Export it (testnet only).`,
    );
  }
  return new Wallet(pk, provider(chain));
}

export interface CompiledContract {
  abi: unknown[];
  bytecode: string;
}

/** Compile contracts/MockUSDT.sol with the bundled solc. Reproducible, offline. */
export function compileMockUsdt(): CompiledContract {
  const source = readFileSync(
    join(__dirname, '..', '..', 'contracts', 'MockUSDT.sol'),
    'utf8',
  );
  const input = {
    language: 'Solidity',
    sources: { 'MockUSDT.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object'] },
      },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter(
    (e: { severity: string }) => e.severity === 'error',
  );
  if (errors.length > 0) {
    throw new Error(
      `solc compile failed:\n${errors.map((e: { formattedMessage: string }) => e.formattedMessage).join('\n')}`,
    );
  }
  const artifact = out.contracts['MockUSDT.sol'].MockUSDT;
  return {
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
  };
}

/** Decimal-string human amount → integer base units (6dp USDT) as bigint. */
export function toBaseUnits(human: string, decimals = 6): bigint {
  const [whole, frac = ''] = human.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(`${whole}${padded}`);
}

export function explorer(chain: string, txHash: string): string {
  const base =
    chain === 'BSC'
      ? 'https://testnet.bscscan.com/tx/'
      : 'https://sepolia.etherscan.io/tx/';
  return `${base}${txHash}`;
}

export function log(section: string, obj: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`\n[${section}]`, JSON.stringify(obj, null, 2));
}
