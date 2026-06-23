import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../lib/errors';
import { featureControlsService } from '../modules/feature-controls/feature-controls.service';
import type { ControlFlag } from '../modules/feature-controls/feature-controls.types';

/**
 * Backend enforcement of per-user feature controls. This sits on the
 * user-facing routes (after `authenticate`, after `validate`) so a disabled
 * control cannot be bypassed by calling the API directly — the admin UI toggle
 * is only the surface; THIS is the gate. It throws FEATURE_DISABLED_FOR_USER
 * (403) when any required flag denies the action.
 *
 * Money-movement service internals (matching engine, ledger settlement,
 * withdrawal signing, manual INR approval) are deliberately untouched.
 */
export function requireUserFeature(...flags: ControlFlag[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      await featureControlsService.assertEnabled(req.user.id, flags);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Order-placement gate. Requires spot trading to be enabled and the side-
 * specific flag (buy/sell) for the order being placed. The order side is read
 * from the already-validated request body.
 */
export function requireOrderPlacementAllowed() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const side = (req.body as { side?: string } | undefined)?.side;
      const flags: ControlFlag[] = ['canTradeSpot'];
      if (side === 'BUY') flags.push('canPlaceBuyOrders');
      else if (side === 'SELL') flags.push('canPlaceSellOrders');
      await featureControlsService.assertEnabled(req.user.id, flags);
      next();
    } catch (err) {
      next(err);
    }
  };
}
