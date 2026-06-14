import { Prisma, type Account, type AccountKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { LedgerPostingLine } from './ledger.types';

type Tx = Prisma.TransactionClient;

export const ledgerRepository = {
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  },

  findExistingPosting(
    tx: Tx,
    referenceType?: string,
    referenceId?: string,
  ) {
    if (!referenceType || !referenceId) return Promise.resolve(null);
    return tx.ledgerTransaction.findFirst({
      where: { referenceType, referenceId },
      include: { entries: true },
    });
  },

  async findOrCreateAccount(
    tx: Tx,
    input: { userId?: string | null; asset: string; kind: AccountKind },
  ): Promise<Account> {
    const existing = await tx.account.findFirst({
      where: {
        userId: input.userId ?? null,
        asset: input.asset,
        kind: input.kind,
      },
    });
    if (existing) return existing;
    return tx.account.create({
      data: {
        userId: input.userId ?? null,
        asset: input.asset,
        kind: input.kind,
      },
    });
  },

  ensureBalance(tx: Tx, accountId: string) {
    return tx.accountBalance.upsert({
      where: { accountId },
      update: {},
      create: { accountId, balance: new Prisma.Decimal(0) },
    });
  },

  creditBalance(tx: Tx, accountId: string, amount: Prisma.Decimal) {
    return tx.accountBalance.update({
      where: { accountId },
      data: {
        balance: { increment: amount },
        version: { increment: 1 },
      },
    });
  },

  debitBalance(
    tx: Tx,
    accountId: string,
    amount: Prisma.Decimal,
    allowNegative: boolean,
  ) {
    if (allowNegative) {
      return tx.accountBalance.updateMany({
        where: { accountId },
        data: {
          balance: { decrement: amount },
          version: { increment: 1 },
        },
      });
    }
    return tx.accountBalance.updateMany({
      where: { accountId, balance: { gte: amount } },
      data: {
        balance: { decrement: amount },
        version: { increment: 1 },
      },
    });
  },

  createLedgerTransaction(
    tx: Tx,
    input: {
      kind: string;
      referenceType?: string;
      referenceId?: string;
      metadata?: Prisma.InputJsonValue;
      lines: Array<LedgerPostingLine & { accountId: string }>;
    },
  ) {
    return tx.ledgerTransaction.create({
      data: {
        kind: input.kind,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadata: input.metadata,
        entries: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            direction: line.direction,
            amount: line.amount,
            asset: line.asset,
          })),
        },
      },
      include: { entries: true },
    });
  },

  listWalletAccounts(userId: string) {
    return prisma.account.findMany({
      where: {
        userId,
        kind: { in: ['USER_AVAILABLE', 'USER_LOCKED'] },
      },
      include: { balance: true },
      orderBy: { asset: 'asc' },
    });
  },

  getWalletAccounts(userId: string, asset: string) {
    return prisma.account.findMany({
      where: {
        userId,
        asset,
        kind: { in: ['USER_AVAILABLE', 'USER_LOCKED'] },
      },
      include: { balance: true },
    });
  },

  listLedgerEntries(input: {
    userId: string;
    asset: string;
    cursor?: string;
    limit: number;
  }) {
    return prisma.ledgerEntry.findMany({
      where: {
        asset: input.asset,
        account: { userId: input.userId },
        ...(input.cursor ? { id: { lt: BigInt(input.cursor) } } : {}),
      },
      include: { txn: true },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  listInrTransactions(input: {
    userId: string;
    type?: 'DEPOSIT' | 'WITHDRAWAL';
    cursor?: string;
    limit: number;
  }) {
    return prisma.inrTransaction.findMany({
      where: {
        userId: input.userId,
        ...(input.type ? { type: input.type } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
    });
  },

  async projectionForAccount(accountId: string): Promise<Prisma.Decimal> {
    const balance = await prisma.accountBalance.findUnique({
      where: { accountId },
    });
    return balance?.balance ?? new Prisma.Decimal(0);
  },

  async entriesBalanceForAccount(accountId: string): Promise<Prisma.Decimal> {
    const rows = await prisma.ledgerEntry.findMany({
      where: { accountId },
      select: { direction: true, amount: true },
    });
    return rows.reduce((sum, row) => {
      return row.direction === 'CREDIT' ? sum.add(row.amount) : sum.sub(row.amount);
    }, new Prisma.Decimal(0));
  },
};

export type LedgerRepository = typeof ledgerRepository;
