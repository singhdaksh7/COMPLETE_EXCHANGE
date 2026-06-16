/**
 * testnet:e2e — full Phase 5.6 custody loop on a real EVM testnet.
 *
 * Drives the EXISTING services end-to-end (no shortcuts around the ledger):
 *   1. seed the scan cursor to a recent window
 *   2. scanner detects the minted MockUSDT deposit → deposit address
 *   3. confirmation service credits the user via LedgerService (idempotent)
 *   4. (best-effort) treasury sweep hot→cold then refill cold→hot (ledger)
 *   5. user requests a withdrawal → admin approves
 *   6. testnet-local signer broadcasts a REAL on-chain transfer
 *   7. confirmation worker finalizes → COMPLETED, ledger settled
 *   8. print final balances + every on-chain tx hash (with explorer links)
 *
 * Prereqs: testnet:deploy-contracts → provision-wallets → fund-demo, plus the
 * HOT wallet funded with native gas (tBNB / SepoliaETH). Run with:
 *   CHAIN_ENV=testnet SIGNER_MODE=testnet-local ALLOW_TESTNET_SIGNING=YES \
 *   SCAN_REORG_BUFFER=1 SCAN_SAFETY_LAG=1 npm run testnet:e2e
 */
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ASSET, explorer, log, prisma, targetChain } from './_shared';
import { config } from '../../src/config';
import { getChainProvider } from '../../src/modules/scanner/providers';
import { scannerService } from '../../src/modules/scanner/scanner.service';
import { confirmationService } from '../../src/modules/scanner/confirmation.service';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { treasuryService } from '../../src/modules/treasury/treasury.service';
import { withdrawalService } from '../../src/modules/withdrawal/withdrawal.service';
import {
  getWithdrawalSigner,
  runBroadcastCycle,
  runConfirmationCycle,
} from '../../src/modules/withdrawal/providers';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function poll<T>(
  label: string,
  fn: () => Promise<T | null>,
  { attempts = 30, delayMs = 4000 } = {},
): Promise<T> {
  for (let i = 0; i < attempts; i += 1) {
    const v = await fn();
    if (v) return v;
    log('poll', { label, attempt: i + 1, of: attempts });
    await sleep(delayMs);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

async function wallet(userId: string): Promise<{ available: string; locked: string }> {
  const w = await ledgerService.getWallet(userId, ASSET);
  return { available: w.available, locked: w.locked };
}

async function main(): Promise<void> {
  const chain = targetChain();
  if (!config.isTestnet) throw new Error('CHAIN_ENV must be testnet');

  const provider = getChainProvider(chain);
  const signer = getWithdrawalSigner(); // testnet-local (fails closed otherwise)
  log('e2e:start', { chain, provider: provider.name, signer: signer.name });

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: `testnet-demo-${chain.toLowerCase()}@example.com` },
  });
  const deposit = await prisma.depositAddress.findFirstOrThrow({
    where: { userId: user.id, chain, isActive: true },
  });
  const dest = await prisma.withdrawalAddress.findFirstOrThrow({
    where: { userId: user.id, chain, deletedAt: null },
  });
  const hotW = await prisma.hotWallet.findFirstOrThrow({ where: { chain, tier: 'HOT', isActive: true } });
  const coldW = await prisma.hotWallet.findFirstOrThrow({ where: { chain, tier: 'COLD', isActive: true } });

  // ---- 1. seed the scan cursor to a recent window ----
  const head = await provider.getLatestBlock();
  const depth = BigInt(process.env.TESTNET_SCAN_DEPTH ?? '120');
  const from = head.number > depth ? head.number - depth : 0n;
  await prisma.chainCursor.upsert({
    where: { chain },
    update: { lastScannedBlock: from, safeBlock: from },
    create: { chain, lastScannedBlock: from, safeBlock: from },
  });
  log('e2e:cursor_seeded', { chain, head: head.number.toString(), from: from.toString() });

  // ---- 2. detect the deposit ----
  const detected = await poll('deposit detected', async () => {
    await scannerService.scanOnce({ provider, chain });
    return prisma.cryptoDeposit.findFirst({ where: { addressId: deposit.id } });
  });
  log('e2e:deposit_detected', {
    id: detected.id,
    txHash: detected.txHash,
    amount: detected.amount.toFixed(),
    status: detected.status,
    explorer: explorer(chain, detected.txHash),
  });

  // ---- 3. confirm + credit ----
  const credited = await poll('deposit credited', async () => {
    await confirmationService.runConfirmations({ provider, chain });
    const d = await prisma.cryptoDeposit.findUniqueOrThrow({ where: { id: detected.id } });
    return d.status === 'CREDITED' ? d : null;
  });
  const afterDeposit = await wallet(user.id);
  log('e2e:deposit_credited', {
    id: credited.id,
    amount: credited.amount.toFixed(),
    available: afterDeposit.available,
  });

  // ---- 4. treasury sweep hot→cold then refill cold→hot (ledger; best-effort) ----
  try {
    const a = await mkAdmin('treasury-a');
    const b = await mkAdmin('treasury-b');
    const sweepAmt = process.env.TESTNET_SWEEP_AMOUNT ?? '10';
    // Seed HOT custody so the sweep has a balance to move (HOT custody is fed by
    // withdrawals in normal operation; here we seed it directly for the demo).
    await fundSystem('HOT_WALLET', sweepAmt);
    const sweep = await treasuryService.requestSweep(
      { fromWalletId: hotW.id, toWalletId: coldW.id, asset: ASSET, amount: sweepAmt },
      { actorId: a },
    );
    await treasuryService.approve(sweep.id, { actorId: b });
    await treasuryService.approve(sweep.id, { actorId: a }).catch(() => undefined);
    const refill = await treasuryService.requestRefill(
      { fromWalletId: coldW.id, toWalletId: hotW.id, asset: ASSET, amount: sweepAmt },
      { actorId: a },
    );
    await treasuryService.approve(refill.id, { actorId: b });
    await treasuryService.approve(refill.id, { actorId: a }).catch(() => undefined);
    log('e2e:treasury', { sweepId: sweep.id, refillId: refill.id, amount: sweepAmt });
  } catch (err) {
    log('e2e:treasury_skipped', { reason: err instanceof Error ? err.message : String(err) });
  }

  // ---- 5. withdrawal request + approve ----
  const fee = Number(config.withdrawal.feeByChain[chain] ?? config.withdrawal.feeUsdt);
  const amount = process.env.TESTNET_WD_AMOUNT ?? (fee + 3).toString();
  const wd = await withdrawalService.requestWithdrawal(user.id, {
    chain,
    toAddress: dest.address,
    amount,
  });
  const admin = await mkAdmin('wd-approver');
  await withdrawalService.approve(wd.id, { actorId: admin });
  log('e2e:withdrawal_approved', { id: wd.id, amount, fee, to: dest.address });

  // ---- 6. real on-chain broadcast ----
  const broadcasts = await runBroadcastCycle(signer, chain);
  const broadcastRow = await prisma.cryptoWithdrawal.findUniqueOrThrow({ where: { id: wd.id } });
  log('e2e:withdrawal_broadcast', {
    broadcasts,
    status: broadcastRow.status,
    txHash: broadcastRow.txHash,
    explorer: broadcastRow.txHash ? explorer(chain, broadcastRow.txHash) : null,
  });
  if (broadcastRow.status !== 'BROADCAST') {
    throw new Error(`withdrawal failed to broadcast: ${broadcastRow.failureReason ?? broadcastRow.status}`);
  }

  // ---- 7. confirm → complete ----
  const completed = await poll('withdrawal completed', async () => {
    await runConfirmationCycle(signer, chain);
    const w = await prisma.cryptoWithdrawal.findUniqueOrThrow({ where: { id: wd.id } });
    return w.status === 'COMPLETED' ? w : null;
  });

  // ---- 8. summary ----
  const finalBal = await wallet(user.id);
  log('e2e:DONE', {
    chain,
    demoUser: user.email,
    deposit: { txHash: credited.txHash, amount: credited.amount.toFixed(), explorer: explorer(chain, credited.txHash) },
    withdrawal: {
      txHash: completed.txHash,
      gross: completed.amount.toFixed(),
      net: completed.netAmount.toFixed(),
      fee: completed.fee.toFixed(),
      explorer: completed.txHash ? explorer(chain, completed.txHash) : null,
    },
    finalLedgerBalance: finalBal,
  });
}

// --- helpers ---
async function mkAdmin(tag: string): Promise<string> {
  const admin = await prisma.admin.create({
    data: {
      email: `testnet-${tag}-${randomUUID().slice(0, 8)}@example.com`,
      passwordHash: await hash('Testnet-Admin-Passw0rd!'),
      totpSecretEnc: Buffer.alloc(0),
      totpEnabled: false,
      status: 'ACTIVE',
    },
  });
  return admin.id;
}

async function fundSystem(kind: 'HOT_WALLET', amount: string): Promise<void> {
  for (let i = 0; ; i += 1) {
    try {
      await ledgerService.post(
        {
          kind: 'TEST_FUNDING',
          referenceType: 'testnet_seed',
          referenceId: randomUUID(),
          lines: [
            { kind: 'SWEEP_CLEARING', userId: null, asset: ASSET, direction: 'DEBIT', amount },
            { kind, userId: null, asset: ASSET, direction: 'CREDIT', amount },
          ],
        },
        {},
      );
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034' && i < 5) {
        await sleep(20 * (i + 1));
        continue;
      }
      throw err;
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('e2e failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
