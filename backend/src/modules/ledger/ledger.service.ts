import { Prisma, type AccountKind } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { ledgerRepository } from './ledger.repository';
import type {
  DecimalString,
  InrTransactionDto,
  LedgerContext,
  LedgerEntryDto,
  LedgerPostingInput,
  WalletDto,
} from './ledger.types';

const INR = 'INR';
const USER_KINDS: AccountKind[] = ['USER_AVAILABLE', 'USER_LOCKED'];

function decimal(value: DecimalString): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function decimalString(value: Prisma.Decimal): string {
  return value.toFixed();
}

function isUserAccount(kind: AccountKind): boolean {
  return USER_KINDS.includes(kind);
}

function isSystemAccount(kind: AccountKind): boolean {
  return !isUserAccount(kind);
}

function assertPostingBalanced(input: LedgerPostingInput): void {
  if (input.lines.length < 2) {
    throw new BadRequestError('A ledger posting requires at least two lines');
  }
  const totals = new Map<string, Prisma.Decimal>();
  for (const line of input.lines) {
    const amount = decimal(line.amount);
    if (amount.lte(0)) throw new BadRequestError('Ledger amounts must be positive');
    const current = totals.get(line.asset) ?? new Prisma.Decimal(0);
    totals.set(
      line.asset,
      line.direction === 'CREDIT' ? current.add(amount) : current.sub(amount),
    );
  }
  for (const [asset, total] of totals) {
    if (!total.equals(0)) {
      throw new BadRequestError(`Ledger transaction is unbalanced for ${asset}`);
    }
  }
}

function walletDto(
  asset: string,
  available: Prisma.Decimal,
  locked: Prisma.Decimal,
): WalletDto {
  return {
    asset,
    available: decimalString(available),
    locked: decimalString(locked),
    total: decimalString(available.add(locked)),
  };
}

function ledgerEntryDto(entry: {
  id: bigint;
  txnId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: Prisma.Decimal;
  asset: string;
  createdAt: Date;
  txn: { kind: string };
}): LedgerEntryDto {
  return {
    id: entry.id.toString(),
    txnId: entry.txnId,
    direction: entry.direction,
    amount: decimalString(entry.amount),
    asset: entry.asset,
    kind: entry.txn.kind,
    createdAt: entry.createdAt,
  };
}

function inrTransactionDto(txn: {
  id: string;
  type: string;
  amount: Prisma.Decimal;
  fee: Prisma.Decimal;
  status: string;
  createdAt: Date;
}): InrTransactionDto {
  return {
    id: txn.id,
    type: txn.type,
    amount: decimalString(txn.amount),
    fee: decimalString(txn.fee),
    status: txn.status,
    createdAt: txn.createdAt,
  };
}

export const ledgerService = {
  async post(input: LedgerPostingInput, ctx: LedgerContext = {}) {
    assertPostingBalanced(input);
    const posted = await ledgerRepository.tx(async (tx) => {
      const existing = await ledgerRepository.findExistingPosting(
        tx,
        input.referenceType,
        input.referenceId,
      );
      if (existing) return existing;

      const linesWithAccounts = [];
      for (const line of input.lines) {
        if (isUserAccount(line.kind) && !line.userId) {
          throw new BadRequestError('User ledger accounts require a userId');
        }
        if (isSystemAccount(line.kind) && line.userId) {
          throw new BadRequestError('System ledger accounts must not have a userId');
        }
        const account = await ledgerRepository.findOrCreateAccount(tx, {
          userId: line.userId ?? null,
          asset: line.asset,
          kind: line.kind,
        });
        await ledgerRepository.ensureBalance(tx, account.id);
        const amount = decimal(line.amount);
        if (line.direction === 'CREDIT') {
          await ledgerRepository.creditBalance(tx, account.id, amount);
        } else {
          const result = await ledgerRepository.debitBalance(
            tx,
            account.id,
            amount,
            isSystemAccount(line.kind),
          );
          if (result.count !== 1) {
            throw new ConflictError(
              'Insufficient balance for ledger debit',
              'INSUFFICIENT_BALANCE',
            );
          }
        }
        linesWithAccounts.push({ ...line, accountId: account.id });
      }

      return ledgerRepository.createLedgerTransaction(tx, {
        kind: input.kind,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        lines: linesWithAccounts,
      });
    });

    await recordAudit({
      actorType: ctx.userId ? 'USER' : 'SYSTEM',
      actorId: ctx.userId,
      action: 'ledger.post',
      entityType: 'ledger_transaction',
      entityId: posted.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        kind: posted.kind,
        referenceType: posted.referenceType,
        referenceId: posted.referenceId,
      },
    });

    return {
      id: posted.id,
      kind: posted.kind,
      entries: posted.entries.map((entry) => ({
        id: entry.id.toString(),
        direction: entry.direction,
        amount: decimalString(entry.amount),
        asset: entry.asset,
      })),
    };
  },

  async internalTransfer(
    input: {
      userId: string;
      toUserId?: string;
      asset: string;
      amount: string;
      fromKind: AccountKind;
      toKind: AccountKind;
      referenceType?: string;
      referenceId?: string;
      metadata?: Record<string, unknown>;
    },
    ctx: LedgerContext = {},
  ) {
    if (!isUserAccount(input.fromKind) || !isUserAccount(input.toKind)) {
      throw new BadRequestError('Internal transfers require user ledger accounts');
    }
    const toUserId = input.toUserId ?? input.userId;
    return this.post(
      {
        kind: 'INTERNAL_TRANSFER',
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadata: input.metadata,
        lines: [
          {
            userId: isUserAccount(input.fromKind) ? input.userId : null,
            kind: input.fromKind,
            asset: input.asset,
            direction: 'DEBIT',
            amount: input.amount,
          },
          {
            userId: isUserAccount(input.toKind) ? toUserId : null,
            kind: input.toKind,
            asset: input.asset,
            direction: 'CREDIT',
            amount: input.amount,
          },
        ],
      },
      { ...ctx, userId: input.userId },
    );
  },

  async listWallets(userId: string): Promise<WalletDto[]> {
    const accounts = await ledgerRepository.listWalletAccounts(userId);
    const byAsset = new Map<string, { available: Prisma.Decimal; locked: Prisma.Decimal }>();
    for (const account of accounts) {
      const item = byAsset.get(account.asset) ?? {
        available: new Prisma.Decimal(0),
        locked: new Prisma.Decimal(0),
      };
      const balance = account.balance?.balance ?? new Prisma.Decimal(0);
      if (account.kind === 'USER_AVAILABLE') item.available = item.available.add(balance);
      if (account.kind === 'USER_LOCKED') item.locked = item.locked.add(balance);
      byAsset.set(account.asset, item);
    }
    return [...byAsset.entries()].map(([asset, item]) =>
      walletDto(asset, item.available, item.locked),
    );
  },

  async getWallet(userId: string, asset: string): Promise<WalletDto> {
    const accounts = await ledgerRepository.getWalletAccounts(userId, asset);
    if (accounts.length === 0) throw new NotFoundError('Wallet not found');
    const available = accounts
      .filter((a) => a.kind === 'USER_AVAILABLE')
      .reduce(
        (sum, a) => sum.add(a.balance?.balance ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );
    const locked = accounts
      .filter((a) => a.kind === 'USER_LOCKED')
      .reduce(
        (sum, a) => sum.add(a.balance?.balance ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );
    return walletDto(asset, available, locked);
  },

  async getInrWallet(userId: string): Promise<WalletDto> {
    const accounts = await ledgerRepository.getWalletAccounts(userId, INR);
    const available = accounts
      .filter((a) => a.kind === 'USER_AVAILABLE')
      .reduce(
        (sum, a) => sum.add(a.balance?.balance ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );
    const locked = accounts
      .filter((a) => a.kind === 'USER_LOCKED')
      .reduce(
        (sum, a) => sum.add(a.balance?.balance ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );
    return walletDto(INR, available, locked);
  },

  async listLedgerEntries(input: {
    userId: string;
    asset: string;
    cursor?: string;
    limit: number;
  }) {
    const rows = await ledgerRepository.listLedgerEntries(input);
    const page = rows.slice(0, input.limit);
    return {
      items: page.map(ledgerEntryDto),
      nextCursor:
        rows.length > input.limit ? rows[input.limit].id.toString() : null,
    };
  },

  async listInrTransactions(input: {
    userId: string;
    type?: 'DEPOSIT' | 'WITHDRAWAL';
    cursor?: string;
    limit: number;
  }) {
    const rows = await ledgerRepository.listInrTransactions(input);
    const page = rows.slice(0, input.limit);
    return {
      items: page.map(inrTransactionDto),
      nextCursor: rows.length > input.limit ? rows[input.limit].id : null,
    };
  },

  async reconcileAccount(accountId: string) {
    const [projection, entries] = await Promise.all([
      ledgerRepository.projectionForAccount(accountId),
      ledgerRepository.entriesBalanceForAccount(accountId),
    ]);
    const diff = projection.sub(entries);
    return {
      accountId,
      projection: decimalString(projection),
      entries: decimalString(entries),
      diff: decimalString(diff),
      balanced: diff.equals(0),
    };
  },
};

export type LedgerService = typeof ledgerService;
