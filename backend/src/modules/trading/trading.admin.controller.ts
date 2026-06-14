import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { tradingService } from './trading.service';
import type { TradingContext } from './trading.types';
import type { AdminOrderQueryDto, AdminTradeQueryDto } from './trading.validators';

function ctx(req: Request): TradingContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin spot-trading monitoring. Behind adminAuthenticate + adminAuthorize —
 * see trading.admin.routes.ts. Every read is audited + written to admin_logs.
 */
export const adminTradingController = {
  async listMarkets(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const markets = await tradingService.adminListMarkets(ctx(req));
    sendSuccess(res, { items: markets });
  },

  async listOrders(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const query = req.query as unknown as AdminOrderQueryDto;
    const result = await tradingService.adminListOrders(query, ctx(req));
    sendSuccess(res, result);
  },

  async listTrades(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const query = req.query as unknown as AdminTradeQueryDto;
    const result = await tradingService.adminListTrades(query, ctx(req));
    sendSuccess(res, result);
  },
};
