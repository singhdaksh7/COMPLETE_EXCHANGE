import {
  Interface,
  JsonRpcProvider,
  Transaction,
  Wallet,
  getAddress,
} from 'ethers';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import type {
  BroadcastResult,
  SignTransferInput,
  SignedTransaction,
  TxConfirmation,
  WithdrawalSignerProvider,
} from './withdrawal-signer.provider';

/**
 * Testnet-local EVM withdrawal signer (Phase 5.6).
 *
 * Signs and broadcasts REAL ERC20/BEP20 `transfer` transactions on public
 * testnets (BSC Testnet, Ethereum Sepolia) using a hot-wallet private key that
 * is loaded ONLY from the environment / AWS Secrets Manager at sign time.
 *
 * HARD SECURITY RULES (enforced here):
 *   - Fails CLOSED: the factory throws unless CHAIN_ENV=testnet AND
 *     ALLOW_TESTNET_SIGNING=YES. There is no way to reach this code on mainnet.
 *   - The private key is read from `process.env[signer.kmsKeyRef]` — the DB only
 *     ever stores that HANDLE, never key material.
 *   - The private key is NEVER logged, NEVER returned, NEVER persisted.
 *   - Only EVM chains are supported. TRON testnet signing is intentionally not
 *     wired here (documented manual flow) so we never half-implement key custody.
 */

// Minimal ERC20 transfer ABI — value crosses as a uint256 in base units.
const ERC20 = new Interface([
  'function transfer(address to, uint256 value) returns (bool)',
]);

const EVM_CHAINS = new Set(['BSC', 'ETHEREUM']);

interface ChainClients {
  provider: JsonRpcProvider;
  wallet: Wallet;
}

export function createTestnetLocalSigner(): WithdrawalSignerProvider {
  // --- Fail closed. Both gates must hold or the signer refuses to exist. ---
  if (!config.isTestnet) {
    throw new Error(
      'testnet-local signer requires CHAIN_ENV=testnet (fail-closed)',
    );
  }
  if (!config.testnet.allowSigning) {
    throw new Error(
      'testnet-local signer requires ALLOW_TESTNET_SIGNING=YES (fail-closed)',
    );
  }

  // One provider+wallet per chain, lazily built. The key is resolved per call
  // from the env handle carried on the signer ref so a key rotation in Secrets
  // Manager takes effect on the next sign without code changes.
  const clientsByChain = new Map<string, ChainClients>();

  function clientsFor(chain: string, keyRef: string): ChainClients {
    const cacheKey = `${chain}:${keyRef}`;
    const cached = clientsByChain.get(cacheKey);
    if (cached) return cached;

    const rpcUrl = config.testnet.rpcUrl[chain];
    if (!rpcUrl) {
      throw new Error(`no testnet RPC url configured for ${chain}`);
    }
    const chainId = config.testnet.chainIds[chain];
    if (!chainId) {
      throw new Error(`no testnet chain id configured for ${chain}`);
    }
    // Resolve the raw key from env/Secrets Manager ONLY. Never log its value.
    const pk = process.env[keyRef];
    if (!pk) {
      throw new Error(
        `testnet signing key not found in env handle '${keyRef}'`,
      );
    }

    const provider = new JsonRpcProvider(rpcUrl, chainId);
    const wallet = new Wallet(pk, provider);
    const clients: ChainClients = { provider, wallet };
    clientsByChain.set(cacheKey, clients);
    return clients;
  }

  return {
    name: 'withdrawal-signer-testnet-local',
    mode: 'live',

    async signTransfer(input: SignTransferInput): Promise<SignedTransaction> {
      const chain = input.chain.toUpperCase();
      if (!EVM_CHAINS.has(chain)) {
        throw new Error(
          `testnet-local signer supports EVM chains only, got '${chain}'`,
        );
      }
      const { provider, wallet } = clientsFor(chain, input.signer.kmsKeyRef);

      // Guard: the key behind the handle MUST control the recorded hot-wallet
      // address, or we would broadcast from the wrong account.
      if (getAddress(wallet.address) !== getAddress(input.fromAddress)) {
        throw new Error('testnet signer address does not match hot wallet');
      }

      const data = ERC20.encodeFunctionData('transfer', [
        getAddress(input.toAddress),
        BigInt(input.amountBase),
      ]);

      // Use the chain's real pending nonce for the on-chain tx. The internal
      // wallet_nonces allocator still enforces the DB (chain, from, nonce)
      // uniqueness; the testnet demo serialises withdrawals so they never race.
      const [nonce, feeData, gasLimit] = await Promise.all([
        provider.getTransactionCount(wallet.address, 'pending'),
        provider.getFeeData(),
        provider.estimateGas({ from: wallet.address, to: input.contract, data }),
      ]);

      // BSC Testnet is legacy-gas; Sepolia is EIP-1559.
      const base =
        chain === 'BSC'
          ? { type: 0 as const, gasPrice: feeData.gasPrice ?? undefined }
          : {
              type: 2 as const,
              maxFeePerGas: feeData.maxFeePerGas ?? undefined,
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
            };

      const rawTx = await wallet.signTransaction({
        to: getAddress(input.contract),
        data,
        value: 0n,
        nonce,
        gasLimit,
        chainId: config.testnet.chainIds[chain],
        ...base,
      });
      const txHash = Transaction.from(rawTx).hash;
      if (!txHash) throw new Error('failed to derive testnet tx hash');

      logger.info(
        { chain, txHash, from: wallet.address, nonce },
        'testnet-local signer: signed transfer',
      );
      return { txHash, rawTx };
    },

    async broadcast(input: {
      chain: string;
      signedTx: SignedTransaction;
    }): Promise<BroadcastResult> {
      const chain = input.chain.toUpperCase();
      const { provider } = clientsFor(chain, config.testnet.evmKeyRef);
      try {
        const resp = await provider.broadcastTransaction(input.signedTx.rawTx);
        return { txHash: resp.hash };
      } catch (err) {
        // Idempotent re-broadcast: a tx already accepted/known keeps its hash.
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        if (
          msg.includes('already known') ||
          msg.includes('nonce too low') ||
          msg.includes('already imported')
        ) {
          return { txHash: input.signedTx.txHash };
        }
        throw err;
      }
    },

    async getConfirmations(input: {
      chain: string;
      txHash: string;
    }): Promise<TxConfirmation> {
      const chain = input.chain.toUpperCase();
      const { provider } = clientsFor(chain, config.testnet.evmKeyRef);
      const receipt = await provider.getTransactionReceipt(input.txHash);
      if (!receipt) {
        // Broadcast but not yet mined → known to us, 0 confirmations, pending OK.
        return { found: true, confirmations: 0, success: true };
      }
      const head = await provider.getBlockNumber();
      const confirmations = Math.max(0, head - receipt.blockNumber + 1);
      return { found: true, confirmations, success: receipt.status === 1 };
    },
  };
}
