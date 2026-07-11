import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { kycRouter } from '../modules/kyc/kyc.routes';
import { complianceRouter } from '../modules/compliance/compliance.routes';
import {
  inrLedgerRouter,
  ledgerRouter,
  walletRouter,
} from '../modules/ledger/ledger.routes';
import { depositRouter } from '../modules/deposit/deposit.routes';
import { inrWithdrawalRouter } from '../modules/inr-withdrawal/inr-withdrawal.routes';
import { walletInfraRouter } from '../modules/wallet/wallet.routes';
import { cryptoDepositRouter } from '../modules/scanner/scanner.routes';
import { cryptoDepositRouter as masterWalletDepositRouter } from '../modules/crypto-deposit/crypto-deposit.routes';
import { withdrawalRouter } from '../modules/withdrawal/withdrawal.routes';
import { conversionRouter } from '../modules/conversion/conversion.routes';
import {
  marketRouter,
  orderRouter,
  tradeRouter,
} from '../modules/trading/trading.routes';
import { marketDataRouter } from '../modules/market-data/market-data.routes';
import { notificationRouter } from '../modules/notification/notification.routes';
import { legalRouter } from '../modules/legal/legal.routes';
import { taxRouter } from '../modules/tax/tax.routes';
import { healthRouter } from '../modules/health/health.routes';
import { securityRouter } from '../modules/user-security/user-security.routes';
import { supportUserRouter } from '../modules/support/support.user.routes';
import { webhooksRouter } from '../modules/webhooks/webhooks.routes';

/**
 * Aggregates all versioned API routers mounted under the API prefix
 * (e.g. /api/v1). New feature modules register their router here.
 */
export const apiRouter = Router();

apiRouter.use('/', healthRouter);
apiRouter.use('/auth', authRouter);
// User security: 2FA / MFA (TOTP) + step-up authentication (Stage 3).
apiRouter.use('/security', securityRouter);
apiRouter.use('/kyc', kycRouter);
// Enhanced compliance/KYC (Stage 5.0): distinct paths (/status, /liveness/*,
// /submit-enhanced) mounted alongside the legacy kycRouter.
apiRouter.use('/kyc', complianceRouter);
// Wallet-infra routes (/wallets/overview, /networks, /addresses) must be
// registered BEFORE the ledger wallet router, whose `/:asset` would otherwise
// shadow these specific paths. Unmatched paths fall through to walletRouter.
apiRouter.use('/wallets', walletInfraRouter);
// Crypto deposit history (/wallets/deposits) before the ledger wallet router,
// whose `/:asset` would otherwise capture "deposits" as an asset symbol.
apiRouter.use('/wallets', cryptoDepositRouter);
apiRouter.use('/wallets', walletRouter);
// Master-wallet USDT crypto deposits V1 (Stage 12) — manual tx-hash flow,
// distinct from the scanner-based custody deposit routes above.
apiRouter.use('/deposits/crypto', masterWalletDepositRouter);
apiRouter.use('/inr/deposits', depositRouter);
// Manual INR withdrawal (Phase 16). Registered before the generic /inr ledger
// router so the specific /inr/withdrawals paths match first.
apiRouter.use('/inr/withdrawals', inrWithdrawalRouter);
apiRouter.use('/inr', inrLedgerRouter);
apiRouter.use('/inr', conversionRouter);
apiRouter.use('/ledger', ledgerRouter);
apiRouter.use('/withdrawals', withdrawalRouter);
// Spot trading (USDT/INR): market data, orders, trades.
apiRouter.use('/markets', marketRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/trades', tradeRouter);
// Live external market data (BTC/ETH/BNB via Binance, USDT/INR reference via
// CoinGecko) — read-only, MARKET DATA ONLY. Distinct from /markets above.
apiRouter.use('/market-data', marketDataRouter);
apiRouter.use('/notifications', notificationRouter);
// Legal acceptance + tax/TDS calculation-only foundation (Stage 5.5).
apiRouter.use('/legal', legalRouter);
apiRouter.use('/tax', taxRouter);
// User-facing support tickets (Stage 9A). Admin side lives under /admin/v1/support.
apiRouter.use('/support', supportUserRouter);
// Provider webhooks (Stage 12: Resend transactional-email delivery events).
apiRouter.use('/webhooks', webhooksRouter);
