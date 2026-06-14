import type { AccountKind, EntryDirection } from '@prisma/client';

export type DecimalString = string;

export interface LedgerContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface LedgerAccountRef {
  userId?: string | null;
  asset: string;
  kind: AccountKind;
}

export interface LedgerPostingLine extends LedgerAccountRef {
  direction: EntryDirection;
  amount: DecimalString;
}

export interface LedgerPostingInput {
  kind: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  lines: LedgerPostingLine[];
}

export interface WalletDto {
  asset: string;
  available: DecimalString;
  locked: DecimalString;
  total: DecimalString;
}

export interface LedgerEntryDto {
  id: string;
  txnId: string;
  direction: EntryDirection;
  amount: DecimalString;
  asset: string;
  kind: string;
  createdAt: Date;
}

export interface InrTransactionDto {
  id: string;
  type: string;
  amount: DecimalString;
  fee: DecimalString;
  status: string;
  createdAt: Date;
}
