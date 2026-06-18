import type { CryptoDeposit, DepositStatus } from '@prisma/client';
import { logger } from '../../lib/logger';
import { recordAudit } from '../../lib/audit';
import { ledgerService } from '../ledger/ledger.service';
import { scannerRepository } from './scanner.repository';
import {
  DEPOSIT_CREDIT_KIND,
  DEPOSIT_REFERENCE_TYPE,
  ScannerAction,
} from './scanner.types';
import type { ConfirmResult } from './scanner.types';

/**
 * Confirmation + crediting service (ARCHITECTURE.md §8.3–8.4).
 *
 * A pass distinct from detection: it walks pending deposits, recomputes
 * confirmation depth from the current head, advances DETECTED → CONFIRMING →
 * CONFIRMED, and ONLY on reaching the required depth credits the user — through
 * LedgerService (double-entry), never by touching balances directly.
 *
 * Crediting is idempotent three ways: the deposit is excluded once CREDITED,
 * LedgerService de-dupes on (referenceType, referenceId), and `markCredited`
 * is a conditional update — so a duplicate scan or a second worker can never
 * double-credit.
 */
export const confirmationService = {
  async runConfirmations(deps: {
    chain?: string;
    provider: any;
  }): Promise<ConfirmResult> {
    const chain = (deps.chain ?? 'TRON').toUpperCase();
    const { provider } = deps;
    const head = await provider.getLatestBlock();
    const candidates = await scannerRepository.listCreditableCandidates(chain);

    let promoted = 0;
    let credited = 0;

    for (const deposit of candidates) {
      if (deposit.blockNumber === null) continue;
      const depth = head.number - deposit.blockNumber + 1n;
      const confirmations = depth < 0n ? 0 : Number(depth);

      const nextStatus: DepositStatus =
        confirmations >= deposit.reqConfirmations
          ? 'CONFIRMED'
          : confirmations >= 1
            ? 'CONFIRMING'
            : 'DETECTED';

      if (
        nextStatus !== deposit.status ||
        confirmations !== deposit.confirmations
      ) {
        await scannerRepository.updateConfirmations(deposit.id, {
          confirmations,
          status: nextStatus,
        });
        if (nextStatus !== deposit.status) promoted += 1;
      }

      if (confirmations >= deposit.reqConfirmations) {
        const didCredit = await this.creditDeposit({
          ...deposit,
          confirmations,
          status: nextStatus,
        });
        if (didCredit) credited += 1;
      }
    }

    return {
      chain,
      headBlock: head.number.toString(),
      promoted,
      credited,
    };
  },

  /**
   * Credit a confirmed deposit through the ledger, exactly once. Returns true
   * only when THIS call performed the credit (so callers can count accurately).
   */
  async creditDeposit(deposit: CryptoDeposit): Promise<boolean> {
    if (deposit.status === 'CREDITED') return false;
    if (!deposit.userId) {
      // No owner resolved (e.g. wrong-chain / unattributed). Never auto-credit;
      // this is handled via admin tooling, not here.
      logger.warn(
        { depositId: deposit.id },
        'Confirmed deposit has no user; skipping auto-credit',
      );
      return false;
    }

    const amount = deposit.amount.toFixed();

    // Double-entry: incoming clearing (asset) → user available (liability).
    const posted = await ledgerService.post(
      {
        kind: DEPOSIT_CREDIT_KIND,
        referenceType: DEPOSIT_REFERENCE_TYPE,
        referenceId: deposit.id,
        metadata: {
          chain: deposit.chain,
          asset: deposit.asset,
          txHash: deposit.txHash,
          logIndex: deposit.logIndex,
        },
        lines: [
          {
            kind: 'SWEEP_CLEARING',
            userId: null,
            asset: deposit.asset,
            direction: 'DEBIT',
            amount,
          },
          {
            kind: 'USER_AVAILABLE',
            userId: deposit.userId,
            asset: deposit.asset,
            direction: 'CREDIT',
            amount,
          },
        ],
      },
      { userId: deposit.userId },
    );

    // Conditional flip — count 0 means another pass already credited it.
    const result = await scannerRepository.markCredited(deposit.id, posted.id);
    if (result.count !== 1) return false;

    await recordAudit({
      actorType: 'SYSTEM',
      action: ScannerAction.DEPOSIT_CREDITED,
      entityType: 'crypto_deposit',
      entityId: deposit.id,
      metadata: {
        chain: deposit.chain,
        asset: deposit.asset,
        amount,
        ledgerTxnId: posted.id,
        txHash: deposit.txHash,
      },
    });
    return true;
  },
};

export type ConfirmationService = typeof confirmationService;
