import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { kycRouter } from '../modules/kyc/kyc.routes';
import {
  inrLedgerRouter,
  ledgerRouter,
  walletRouter,
} from '../modules/ledger/ledger.routes';
import { depositRouter } from '../modules/deposit/deposit.routes';
import { walletInfraRouter } from '../modules/wallet/wallet.routes';
import { cryptoDepositRouter } from '../modules/scanner/scanner.routes';
import { withdrawalRouter } from '../modules/withdrawal/withdrawal.routes';
import { conversionRouter } from '../modules/conversion/conversion.routes';
import {
  marketRouter,
  orderRouter,
  tradeRouter,
} from '../modules/trading/trading.routes';

/**
 * Aggregates all versioned API routers mounted under the API prefix
 * (e.g. /api/v1). New feature modules register their router here.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/kyc', kycRouter);
// Wallet-infra routes (/wallets/overview, /networks, /addresses) must be
// registered BEFORE the ledger wallet router, whose `/:asset` would otherwise
// shadow these specific paths. Unmatched paths fall through to walletRouter.
apiRouter.use('/wallets', walletInfraRouter);
// Crypto deposit history (/wallets/deposits) before the ledger wallet router,
// whose `/:asset` would otherwise capture "deposits" as an asset symbol.
apiRouter.use('/wallets', cryptoDepositRouter);
apiRouter.use('/wallets', walletRouter);
apiRouter.use('/inr/deposits', depositRouter);
apiRouter.use('/inr', inrLedgerRouter);
apiRouter.use('/inr', conversionRouter);
apiRouter.use('/ledger', ledgerRouter);
apiRouter.use('/withdrawals', withdrawalRouter);
// Spot trading (USDT/INR): market data, orders, trades.
apiRouter.use('/markets', marketRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/trades', tradeRouter);
