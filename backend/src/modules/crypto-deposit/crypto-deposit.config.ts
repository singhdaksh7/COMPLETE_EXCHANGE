import { config } from '../../config';

/**
 * Master-wallet USDT deposit network configuration (Stage 12 V1).
 *
 * The env-derived `config.cryptoDeposits` is the single source of truth for
 * master addresses, token contracts, decimals, confirmations and the secret
 * RPC/API endpoints. This module exposes typed accessors plus a PUBLIC DTO
 * mapper that strips every secret (rpcUrl / apiUrl / apiKey) so route handlers
 * can never accidentally leak a provider key to the client.
 */

export const SUPPORTED_CHAINS = ['BSC', 'ETH', 'TRON'] as const;
export type CryptoChain = (typeof SUPPORTED_CHAINS)[number];

export interface ResolvedNetwork {
  chain: CryptoChain;
  family: 'EVM' | 'TRON';
  networkName: string;
  assetSymbol: string;
  decimals: number;
  masterAddress: string | null;
  tokenContract: string | null;
  minConfirmations: number;
  // SERVER-ONLY — never serialize these to a client response.
  rpcUrl: string | null;
  apiUrl: string | null;
  apiKey: string | null;
}

/** Public, secrets-free view of a network for user/admin responses. */
export interface PublicNetworkDto {
  chain: CryptoChain;
  assetSymbol: string;
  label: string;
  masterAddress: string | null;
  minConfirmations: number;
  decimals: number;
  enabled: boolean;
  warning: string;
}

const DEPOSIT_WARNING =
  'Only send USDT on the selected network to this address. Sending any other ' +
  'token or using a different chain may result in permanent loss of funds.';

/**
 * Families with a working on-chain verifier in V1. EVM (BSC/ETH) is live; TRON
 * verification is intentionally deferred (a clean provider abstraction exists,
 * but we never fake a confirmed TRON deposit), so TRON stays disabled even if
 * its env config is present.
 */
const VERIFIABLE_FAMILIES: ResolvedNetwork['family'][] = ['EVM'];

export function isFamilyVerifiable(family: ResolvedNetwork['family']): boolean {
  return VERIFIABLE_FAMILIES.includes(family);
}

export function isSupportedChain(value: unknown): value is CryptoChain {
  return (
    typeof value === 'string' && (SUPPORTED_CHAINS as readonly string[]).includes(value)
  );
}

/** Resolve the full (secret-bearing) network config for a chain, or null. */
export function getNetwork(chain: string): ResolvedNetwork | null {
  if (!isSupportedChain(chain)) return null;
  const n = config.cryptoDeposits.networks[chain];
  return {
    chain: n.chain,
    family: n.family,
    networkName: n.networkName,
    assetSymbol: n.assetSymbol,
    decimals: n.decimals,
    masterAddress: n.masterAddress,
    tokenContract: n.tokenContract,
    minConfirmations: n.minConfirmations,
    rpcUrl: n.rpcUrl,
    apiUrl: n.apiUrl,
    apiKey: n.apiKey,
  };
}

/**
 * A network is "configured" when it has the public receiving address, the token
 * contract, AND a server-side endpoint to verify against. Missing any of these
 * means we cannot safely verify, so the network is treated as not-configured.
 */
export function isNetworkConfigured(n: ResolvedNetwork): boolean {
  const endpoint = n.family === 'EVM' ? n.rpcUrl : n.apiUrl;
  return Boolean(n.masterAddress && n.tokenContract && endpoint);
}

/**
 * A network is usable only when the master switch is on, it is configured, AND
 * its family has a working verifier in this version. This keeps the user/admin
 * surfaces, the networks list, and the submit path consistent (a network is
 * never shown as enabled while its verifier would reject every submission).
 */
export function isNetworkEnabled(n: ResolvedNetwork): boolean {
  return (
    config.cryptoDeposits.enabled &&
    isNetworkConfigured(n) &&
    isFamilyVerifiable(n.family)
  );
}

/** True when the whole crypto-deposit feature is switched on. */
export function cryptoDepositsEnabled(): boolean {
  return config.cryptoDeposits.enabled;
}

/** Map a resolved network to its PUBLIC (secrets-free) DTO. */
export function toPublicNetwork(n: ResolvedNetwork): PublicNetworkDto {
  const enabled = isNetworkEnabled(n);
  return {
    chain: n.chain,
    assetSymbol: n.assetSymbol,
    label: n.networkName,
    // Only reveal the address when the network is actually enabled.
    masterAddress: enabled ? n.masterAddress : null,
    minConfirmations: n.minConfirmations,
    decimals: n.decimals,
    enabled,
    warning: DEPOSIT_WARNING,
  };
}

/** All supported networks that are currently enabled (public DTOs only). */
export function listEnabledPublicNetworks(): PublicNetworkDto[] {
  return SUPPORTED_CHAINS.map((c) => getNetwork(c))
    .filter((n): n is ResolvedNetwork => n !== null)
    .map(toPublicNetwork)
    .filter((dto) => dto.enabled);
}
