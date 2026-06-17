import { Prisma, type WalletTier } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { isChainScanned } from '../../lib/explorer';
import { ledgerService } from '../ledger/ledger.service';
import { walletRepository } from './wallet.repository';
import { getAddressDerivationProvider } from './providers';
import {
  WalletAction,
  toChainSignerDto,
  toDepositAddressDto,
  toHotWalletDto,
  toNetworkDto,
} from './wallet.types';
import type {
  ChainSignerDto,
  DepositAddressDto,
  HotWalletDto,
  NetworkDto,
  WalletContext,
  WalletOverviewAssetDto,
  WalletOverviewDto,
} from './wallet.types';

const MAX_ALLOC_ATTEMPTS = 3;

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

function isSerializationError(err: unknown): boolean {
  // P2034 = transaction conflict / write-skew under SERIALIZABLE → safe to retry.
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034'
  );
}

export const walletService = {
  // ------------------------------------------------------------------
  // 1. User wallet overview — ledger balances + deposit networks/addresses.
  //    Balances are ALWAYS the ledger's truth; on-chain balances are never
  //    treated as the user's balance.
  // ------------------------------------------------------------------
  async getOverview(userId: string): Promise<WalletOverviewDto> {
    const [balances, networks, addresses] = await Promise.all([
      ledgerService.listWallets(userId),
      walletRepository.listSupportedNetworks(),
      walletRepository.listUserAddresses(userId),
    ]);

    const addrByChain = new Map<string, string>();
    for (const a of addresses) {
      if (a.isActive) addrByChain.set(a.chain.toUpperCase(), a.address);
    }
    const balByAsset = new Map(
      balances.map((b) => [b.asset.toUpperCase(), b]),
    );

    const byAsset = new Map<string, WalletOverviewAssetDto>();
    for (const n of networks) {
      const key = n.asset.toUpperCase();
      let entry = byAsset.get(key);
      if (!entry) {
        const bal = balByAsset.get(key);
        entry = {
          asset: n.asset,
          available: bal?.available ?? '0',
          locked: bal?.locked ?? '0',
          total: bal?.total ?? '0',
          networks: [],
        };
        byAsset.set(key, entry);
      }
      entry.networks.push({
        chain: n.chain,
        family: n.chainRef.family,
        contractAddr: n.contractAddr,
        minConfirmations: n.minConfirmations,
        depositAddress: addrByChain.get(n.chain.toUpperCase()) ?? null,
        scanned: isChainScanned(n.chain),
      });
    }

    return { balances, assets: [...byAsset.values()] };
  },

  // ------------------------------------------------------------------
  // 2. Supported asset/chain listing (from asset_chains seed data).
  // ------------------------------------------------------------------
  async listSupportedNetworks(chain?: string): Promise<NetworkDto[]> {
    const rows = await walletRepository.listSupportedNetworks(
      chain ? { chain } : {},
    );
    return rows.map(toNetworkDto);
  },

  // ------------------------------------------------------------------
  // 3. List the user's deposit addresses.
  // ------------------------------------------------------------------
  async listAddresses(
    userId: string,
    chain?: string,
  ): Promise<DepositAddressDto[]> {
    const rows = await walletRepository.listUserAddresses(
      userId,
      chain ? { chain } : {},
    );
    return rows.map(toDepositAddressDto);
  },

  // ------------------------------------------------------------------
  // 3 + 5. Deposit address request / assignment.
  //   - Returns the existing ACTIVE address for (user, chain) if one exists.
  //   - Otherwise derives a new address via the mock provider and assigns it.
  //   The DB enforces ONE active address per (user, chain) and a unique
  //   derivation index per chain; we honour both under concurrency.
  // ------------------------------------------------------------------
  async requestDepositAddress(
    userId: string,
    chainInput: string,
    ctx: WalletContext = {},
  ): Promise<{ address: DepositAddressDto; created: boolean }> {
    const chain = await walletRepository.findActiveChain(chainInput);
    if (!chain) {
      throw new AppError(
        `Chain '${chainInput}' is not supported or is inactive`,
        422,
        'CHAIN_NOT_SUPPORTED',
      );
    }
    const supported = await walletRepository.chainHasSupportedAsset(chain.id);
    if (!supported) {
      throw new AppError(
        `Chain '${chain.id}' has no depositable assets`,
        422,
        'CHAIN_NOT_SUPPORTED',
      );
    }

    // Fast path: an active address already exists.
    const existing = await walletRepository.findActiveAddress(userId, chain.id);
    if (existing) {
      return { address: toDepositAddressDto(existing), created: false };
    }

    const provider = getAddressDerivationProvider();

    for (let attempt = 0; attempt < MAX_ALLOC_ATTEMPTS; attempt += 1) {
      try {
        const result = await walletRepository.tx(async (tx) => {
          // Re-check inside the serializable tx to collapse races.
          const active = await walletRepository.findActiveAddress(
            userId,
            chain.id,
            tx,
          );
          if (active) return { row: active, created: false };

          const derivationIndex = await walletRepository.nextDerivationIndex(
            chain.id,
            tx,
          );
          const { address } = await provider.deriveAddress({
            chain: chain.id,
            family: chain.family,
            derivationIndex,
          });
          const row = await walletRepository.createAddress(
            { userId, chain: chain.id, address, derivationIndex },
            tx,
          );
          return { row, created: true };
        });

        if (result.created) {
          await recordAudit({
            actorType: 'USER',
            actorId: userId,
            action: WalletAction.ADDRESS_DERIVED,
            entityType: 'deposit_address',
            entityId: result.row.id,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            requestId: ctx.requestId,
            metadata: {
              chain: chain.id,
              address: result.row.address,
              derivationIndex: result.row.derivationIndex.toString(),
              provider: provider.name,
            },
          });
        }
        return {
          address: toDepositAddressDto(result.row),
          created: result.created,
        };
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Either another request won the (user, chain) active slot, or two
          // chains raced the same derivation index. If an active address now
          // exists, return it; otherwise retry a fresh index.
          const active = await walletRepository.findActiveAddress(
            userId,
            chain.id,
          );
          if (active) {
            return { address: toDepositAddressDto(active), created: false };
          }
          continue;
        }
        if (isSerializationError(err)) continue;
        throw err;
      }
    }

    throw new AppError(
      'Could not allocate a deposit address; please retry',
      409,
      'ADDRESS_ALLOCATION_RETRY',
    );
  },

  // ------------------------------------------------------------------
  // 9. Admin: deposit address monitoring
  // ------------------------------------------------------------------
  async adminListDepositAddresses(
    input: { chain?: string; userId?: string; cursor?: string; limit: number },
    ctx: WalletContext = {},
  ): Promise<{ items: DepositAddressDto[]; nextCursor: string | null }> {
    const rows = await walletRepository.adminListDepositAddresses(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    await this.auditAdmin(ctx, {
      action: WalletAction.ADMIN_ADDRESS_LIST,
      targetType: 'deposit_address_queue',
      afterState: { count: slice.length, filters: input as object },
    });
    return {
      items: slice.map(toDepositAddressDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  // ------------------------------------------------------------------
  // 6 + 8. Admin: hot-wallet registry (incl. signer ref + nonce) read.
  // ------------------------------------------------------------------
  async adminListHotWallets(
    input: { chain?: string; tier?: WalletTier },
    ctx: WalletContext = {},
  ): Promise<HotWalletDto[]> {
    const rows = await walletRepository.listHotWallets(input);
    await this.auditAdmin(ctx, {
      action: WalletAction.ADMIN_HOT_WALLET_LIST,
      targetType: 'hot_wallet_registry',
      afterState: { count: rows.length, filters: input as object },
    });
    return rows.map(toHotWalletDto);
  },

  // ------------------------------------------------------------------
  // 7. Admin: chain signer registry read (key references only).
  // ------------------------------------------------------------------
  async adminListSigners(
    input: { chain?: string },
    ctx: WalletContext = {},
  ): Promise<ChainSignerDto[]> {
    const rows = await walletRepository.listChainSigners(input);
    await this.auditAdmin(ctx, {
      action: WalletAction.ADMIN_SIGNER_LIST,
      targetType: 'chain_signer_registry',
      afterState: { count: rows.length, filters: input as object },
    });
    return rows.map(toChainSignerDto);
  },

  // ------------------------------------------------------------------
  // 10. Audit helper for admin actions (audit_logs + admin_logs).
  // ------------------------------------------------------------------
  async auditAdmin(
    ctx: WalletContext,
    input: {
      action: string;
      targetType?: string;
      targetId?: string;
      afterState?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: input.action,
      entityType: input.targetType,
      entityId: input.targetId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: input.afterState,
    });
    if (ctx.actorId) {
      await walletRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ip: ctx.ip,
        requestId: ctx.requestId,
        afterState: input.afterState,
      });
    }
  },
};

export type WalletService = typeof walletService;
