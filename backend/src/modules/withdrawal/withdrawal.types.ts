import {
  Prisma,
  type CryptoWithdrawal,
  type WithdrawalAddress,
  type WithdrawalStatus,
} from '@prisma/client';
import { config } from '../../config';

/** Request-scoped forensic context threaded into the service for auditing. */
export interface WithdrawalContext {
  userId?: string;
  actorId?: string; // admin id for admin-surface calls
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Stable action codes (kept together to avoid typos in the audit trail). */
export const WithdrawalAction = {
  ADDRESS_ADDED: 'crypto.withdrawal.address_added',
  REQUESTED: 'crypto.withdrawal.requested',
  HOLD_PLACED: 'crypto.withdrawal.hold_placed',
  APPROVED: 'crypto.withdrawal.approved',
  REJECTED: 'crypto.withdrawal.rejected',
  BROADCAST: 'crypto.withdrawal.broadcast',
  COMPLETED: 'crypto.withdrawal.completed',
  FAILED: 'crypto.withdrawal.failed',
  HOLD_RELEASED: 'crypto.withdrawal.hold_released',
  ADMIN_QUEUE_VIEW: 'crypto.withdrawal.admin_queue_view',
} as const;

/** Ledger transaction kinds + reference types (each idempotent independently). */
export const LEDGER = {
  HOLD_KIND: 'WITHDRAWAL_HOLD',
  RELEASE_KIND: 'WITHDRAWAL_RELEASE',
  FINAL_KIND: 'WITHDRAWAL_FINAL',
  REF_HOLD: 'crypto_withdrawal',
  REF_RELEASE: 'crypto_withdrawal_release',
  REF_FINAL: 'crypto_withdrawal_final',
} as const;

/** Default chain for the legacy single-chain surface (back-compat). */
export const CHAIN = 'TRON';
export const ASSET = 'USDT';

/** Chains the withdrawal flow supports (TRON + EVM Ethereum/BSC). */
export const SUPPORTED_CHAINS = ['TRON', 'ETHEREUM', 'BSC'] as const;
export type WithdrawalChain = (typeof SUPPORTED_CHAINS)[number];

/** EVM chains share the 0x-address + nonce semantics. */
const EVM_CHAINS = new Set<string>(['ETHEREUM', 'BSC']);

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isSupportedChain(chain: string): chain is WithdrawalChain {
  return (SUPPORTED_CHAINS as readonly string[]).includes(chain);
}

/** Is `address` well-formed for `chain`? EVM → 0x+40 hex; TRON → base58 T-addr. */
export function isValidAddressForChain(chain: string, address: string): boolean {
  if (EVM_CHAINS.has(chain)) return EVM_ADDRESS_RE.test(address);
  if (chain === 'TRON') return TRON_ADDRESS_RE.test(address);
  return false;
}

/** Flat USDT withdrawal fee for a chain (gas profile differs per network). */
export function feeForChain(chain: string): Prisma.Decimal {
  const fee = config.withdrawal.feeByChain[chain] ?? config.withdrawal.feeUsdt;
  return new Prisma.Decimal(fee);
}

export interface WithdrawalAddressDto {
  id: string;
  chain: string;
  address: string;
  label: string | null;
  whitelistedAt: Date | null;
  /** True once the cooling-off period has elapsed and it is usable. */
  usable: boolean;
  createdAt: Date;
}

export interface CryptoWithdrawalDto {
  id: string;
  userId: string;
  chain: string;
  asset: string;
  toAddress: string;
  fromAddress: string | null;
  amount: string;
  fee: string;
  netAmount: string;
  status: WithdrawalStatus;
  txHash: string | null;
  nonce: string | null;
  failureReason: string | null;
  requestedAt: Date;
  broadcastAt: Date | null;
  completedAt: Date | null;
}

export function toWithdrawalAddressDto(
  row: WithdrawalAddress,
  now = new Date(),
): WithdrawalAddressDto {
  return {
    id: row.id,
    chain: row.chain,
    address: row.address,
    label: row.label,
    whitelistedAt: row.whitelistedAt,
    usable: row.whitelistedAt !== null && row.whitelistedAt <= now,
    createdAt: row.createdAt,
  };
}

export function toCryptoWithdrawalDto(row: CryptoWithdrawal): CryptoWithdrawalDto {
  return {
    id: row.id,
    userId: row.userId,
    chain: row.chain,
    asset: row.asset,
    toAddress: row.toAddress,
    fromAddress: row.fromAddress,
    amount: row.amount.toFixed(),
    fee: row.fee.toFixed(),
    netAmount: row.netAmount.toFixed(),
    status: row.status,
    txHash: row.txHash,
    nonce: row.nonce === null ? null : row.nonce.toString(),
    failureReason: row.failureReason,
    requestedAt: row.requestedAt,
    broadcastAt: row.broadcastAt,
    completedAt: row.completedAt,
  };
}

/** Convert a human decimal-string amount to integer base units (no floats). */
export function humanToBase(amount: string, decimals: number): string {
  const base = new Prisma.Decimal(amount).mul(new Prisma.Decimal(10).pow(decimals));
  if (!base.isInteger()) {
    throw new Error('Amount has more precision than the asset supports');
  }
  return base.toFixed(0);
}
