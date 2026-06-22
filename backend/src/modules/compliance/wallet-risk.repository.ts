import {
  Prisma,
  type TravelRuleStatus,
  type TravelRuleTransfer,
  type WalletRiskCheck,
  type WalletRiskEvent,
  type WalletRiskProfile,
  type WalletRiskStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 5.3 wallet-risk + Travel Rule tables. The ONLY place
 * that talks to Prisma for wallet_risk_profiles / wallet_risk_checks /
 * wallet_risk_events / travel_rule_transfers / travel_rule_counterparties. It
 * never touches the ledger, scanner, trading, or withdrawal money-movement
 * state, and never deletes a record.
 */

export type WalletRiskProfileWithChecks = WalletRiskProfile & {
  checks: WalletRiskCheck[];
  events: WalletRiskEvent[];
};

export const walletRiskRepository = {
  /* ---------------- profiles ---------------- */
  findProfile(chain: string, address: string): Promise<WalletRiskProfile | null> {
    return prisma.walletRiskProfile.findUnique({
      where: { chain_address: { chain, address } },
    });
  },

  findProfileById(id: string): Promise<WalletRiskProfileWithChecks | null> {
    return prisma.walletRiskProfile.findUnique({
      where: { id },
      include: {
        checks: { orderBy: { createdAt: 'desc' }, take: 50 },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    }) as Promise<WalletRiskProfileWithChecks | null>;
  },

  upsertProfile(
    chain: string,
    address: string,
    create: Prisma.WalletRiskProfileUncheckedCreateInput,
    update: Prisma.WalletRiskProfileUncheckedUpdateInput,
  ): Promise<WalletRiskProfile> {
    return prisma.walletRiskProfile.upsert({
      where: { chain_address: { chain, address } },
      create: { ...create, chain, address },
      update,
    });
  },

  updateProfile(
    id: string,
    data: Prisma.WalletRiskProfileUncheckedUpdateInput,
  ): Promise<WalletRiskProfile> {
    return prisma.walletRiskProfile.update({ where: { id }, data });
  },

  listProfiles(input: {
    level?: string;
    status?: WalletRiskStatus;
    limit: number;
    cursor?: string;
  }): Promise<WalletRiskProfile[]> {
    return prisma.walletRiskProfile.findMany({
      where: {
        ...(input.level ? { level: input.level as never } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  /* ---------------- checks (idempotent) ---------------- */
  findCheck(id: string): Promise<WalletRiskCheck | null> {
    return prisma.walletRiskCheck.findUnique({ where: { id } });
  },

  async upsertCheck(
    data: Prisma.WalletRiskCheckUncheckedCreateInput,
  ): Promise<{ check: WalletRiskCheck; created: boolean }> {
    const existing = await prisma.walletRiskCheck.findUnique({ where: { dedupeKey: data.dedupeKey } });
    if (existing) return { check: existing, created: false };
    const check = await prisma.walletRiskCheck.create({ data });
    return { check, created: true };
  },

  updateCheck(
    id: string,
    data: Prisma.WalletRiskCheckUncheckedUpdateInput,
  ): Promise<WalletRiskCheck> {
    return prisma.walletRiskCheck.update({ where: { id }, data });
  },

  listChecks(input: {
    userId?: string;
    status?: WalletRiskStatus;
    chain?: string;
    address?: string;
    limit: number;
    cursor?: string;
  }): Promise<WalletRiskCheck[]> {
    return prisma.walletRiskCheck.findMany({
      where: {
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.chain ? { chain: input.chain } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  /* ---------------- events ---------------- */
  createEvent(
    data: Prisma.WalletRiskEventUncheckedCreateInput,
  ): Promise<WalletRiskEvent> {
    return prisma.walletRiskEvent.create({ data });
  },

  /* ---------------- travel rule ---------------- */
  findTransfer(id: string): Promise<(TravelRuleTransfer & { counterparty: { id: string; name: string } | null }) | null> {
    return prisma.travelRuleTransfer.findUnique({
      where: { id },
      include: { counterparty: { select: { id: true, name: true } } },
    });
  },

  findTransferByDedupe(dedupeKey: string): Promise<TravelRuleTransfer | null> {
    return prisma.travelRuleTransfer.findUnique({ where: { dedupeKey } });
  },

  async upsertTransfer(
    data: Prisma.TravelRuleTransferUncheckedCreateInput,
  ): Promise<{ transfer: TravelRuleTransfer; created: boolean }> {
    const existing = await prisma.travelRuleTransfer.findUnique({ where: { dedupeKey: data.dedupeKey } });
    if (existing) return { transfer: existing, created: false };
    const transfer = await prisma.travelRuleTransfer.create({ data });
    return { transfer, created: true };
  },

  updateTransfer(
    id: string,
    data: Prisma.TravelRuleTransferUncheckedUpdateInput,
  ): Promise<TravelRuleTransfer> {
    return prisma.travelRuleTransfer.update({ where: { id }, data });
  },

  listTransfers(input: {
    status?: TravelRuleStatus;
    direction?: string;
    userId?: string;
    limit: number;
    cursor?: string;
  }): Promise<TravelRuleTransfer[]> {
    return prisma.travelRuleTransfer.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.direction ? { direction: input.direction as never } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  /* ---------------- dashboard summary ---------------- */
  async summary(): Promise<{
    highRiskProfiles: number;
    blockedProfiles: number;
    reviewRequiredChecks: number;
    pendingTravelRule: number;
  }> {
    const [highRiskProfiles, blockedProfiles, reviewRequiredChecks, pendingTravelRule] =
      await Promise.all([
        prisma.walletRiskProfile.count({ where: { level: { in: ['HIGH', 'CRITICAL'] } } }),
        prisma.walletRiskProfile.count({ where: { status: 'BLOCKED' } }),
        prisma.walletRiskCheck.count({ where: { status: 'REVIEW_REQUIRED' } }),
        prisma.travelRuleTransfer.count({ where: { status: { in: ['REQUIRED', 'PENDING_INFO'] } } }),
      ]);
    return { highRiskProfiles, blockedProfiles, reviewRequiredChecks, pendingTravelRule };
  },
};

export type WalletRiskRepository = typeof walletRiskRepository;
