import type {
  AssetChain,
  Chain,
  ChainFamily,
  ChainSigner,
  DepositAddress,
  HotWallet,
  WalletNonce,
  WalletTier,
} from '@prisma/client';
import type { WalletDto } from '../ledger/ledger.types';
import type { ChainSignerRef } from './providers/chain-signer.provider';

/** Request-scoped forensic context threaded into the service for auditing. */
export interface WalletContext {
  userId?: string;
  actorId?: string; // admin id for admin-surface calls
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Stable action codes (kept together to avoid typos in the audit trail). */
export const WalletAction = {
  ADDRESS_DERIVED: 'wallet.address.derived',
  ADDRESS_REQUESTED: 'wallet.address.requested',
  OVERVIEW_VIEW: 'wallet.overview.view',
  ADMIN_ADDRESS_LIST: 'wallet.admin.address_list',
  ADMIN_HOT_WALLET_LIST: 'wallet.admin.hot_wallet_list',
  ADMIN_SIGNER_LIST: 'wallet.admin.signer_list',
} as const;

/** A supported asset on a specific chain (from asset_chains). */
export interface NetworkDto {
  asset: string;
  chain: string;
  family: ChainFamily;
  contractAddr: string | null;
  decimals: number;
  minConfirmations: number;
}

/** Public deposit-address view (matches OpenAPI `DepositAddress`). */
export interface DepositAddressDto {
  id: string;
  chain: string;
  address: string;
  isActive: boolean;
  createdAt: Date;
}

/** One asset row in the wallet overview: ledger balance + its deposit networks. */
export interface WalletOverviewAssetDto {
  asset: string;
  /** Ledger-derived balance — NEVER an on-chain balance. */
  available: string;
  locked: string;
  total: string;
  networks: Array<{
    chain: string;
    family: ChainFamily;
    contractAddr: string | null;
    minConfirmations: number;
    /** The user's active deposit address for this chain, if derived. */
    depositAddress: string | null;
  }>;
}

export interface WalletOverviewDto {
  /** Raw ledger balances per asset (available/locked/total). */
  balances: WalletDto[];
  /** Per-crypto-asset deposit networks + addresses + ledger balance. */
  assets: WalletOverviewAssetDto[];
}

/** Admin view of a hot wallet incl. its signer ref + nonce (read-only). */
export interface HotWalletDto {
  id: string;
  chain: string;
  address: string;
  tier: WalletTier;
  label: string | null;
  isActive: boolean;
  signer: ChainSignerRef | null;
  nonce: { nextNonce: string; updatedAt: Date } | null;
}

export interface ChainSignerDto extends ChainSignerRef {
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function toNetworkDto(
  row: AssetChain & { chainRef: Chain },
): NetworkDto {
  return {
    asset: row.asset,
    chain: row.chain,
    family: row.chainRef.family,
    contractAddr: row.contractAddr,
    decimals: row.decimals,
    minConfirmations: row.minConfirmations,
  };
}

export function toDepositAddressDto(row: DepositAddress): DepositAddressDto {
  return {
    id: row.id,
    chain: row.chain,
    address: row.address,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export function toChainSignerRef(row: ChainSigner): ChainSignerRef {
  return {
    id: row.id,
    chain: row.chain,
    name: row.name,
    kmsKeyRef: row.kmsKeyRef,
    publicKey: row.publicKey,
    status: row.status,
  };
}

export function toChainSignerDto(row: ChainSigner): ChainSignerDto {
  return { ...toChainSignerRef(row), createdAt: row.createdAt };
}

export function toHotWalletDto(
  row: HotWallet & { signer: ChainSigner | null; nonce: WalletNonce | null },
): HotWalletDto {
  return {
    id: row.id,
    chain: row.chain,
    address: row.address,
    tier: row.tier,
    label: row.label,
    isActive: row.isActive,
    signer: row.signer ? toChainSignerRef(row.signer) : null,
    nonce: row.nonce
      ? { nextNonce: row.nonce.nextNonce.toString(), updatedAt: row.nonce.updatedAt }
      : null,
  };
}
