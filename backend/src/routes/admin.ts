import { Router } from 'express';
import { adminRbacRouter } from '../modules/admin-rbac/admin-rbac.routes';
import { adminKycRouter } from '../modules/kyc/kyc.admin.routes';
import { adminDepositRouter } from '../modules/deposit/deposit.admin.routes';
import { adminWalletRouter } from '../modules/wallet/wallet.admin.routes';
import { adminScannerRouter } from '../modules/scanner/scanner.admin.routes';
import { adminWithdrawalRouter } from '../modules/withdrawal/withdrawal.admin.routes';
import { adminConversionRouter } from '../modules/conversion/conversion.admin.routes';
import { adminTradingRouter } from '../modules/trading/trading.admin.routes';
import { adminOperationsRouter } from '../modules/operations/operations.admin.routes';

/**
 * Aggregates all admin API routers mounted under the admin prefix
 * (e.g. /admin/v1). This is the admin-side parallel of routes/index.ts.
 *
 * IMPORTANT: the admin surface is a SEPARATE process (admin-server.ts) on a
 * separate hostname reachable only via VPN / IP allowlist (ARCHITECTURE.md
 * §1.2, §12). Admin authentication + RBAC + dual-control land in Module 8;
 * every router registered here MUST sit behind that admin auth middleware once
 * it exists. Until then this process exposes no privileged routes.
 */
export const adminApiRouter = Router();

// Liveness ping so the separate admin deployment is observable on its prefix.
adminApiRouter.get('/ping', (_req, res) => {
  res.json({ success: true, data: { surface: 'admin', status: 'ok' } });
});

adminApiRouter.use('/', adminRbacRouter);
adminApiRouter.use('/kyc', adminKycRouter);
adminApiRouter.use('/inr/deposits', adminDepositRouter);
adminApiRouter.use('/wallets', adminWalletRouter);
adminApiRouter.use('/scanner', adminScannerRouter);
adminApiRouter.use('/withdrawals', adminWithdrawalRouter);
adminApiRouter.use('/conversions', adminConversionRouter);
adminApiRouter.use('/spot', adminTradingRouter);
adminApiRouter.use('/operations', adminOperationsRouter);

// Future admin modules (each behind admin RBAC):
// adminApiRouter.use('/withdrawals', adminWithdrawalsRouter);
// adminApiRouter.use('/audit', adminAuditRouter);
// adminApiRouter.use('/roles', adminRolesRouter);
