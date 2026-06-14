import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { conversionService } from './conversion.service';
import type { ConversionContext } from './conversion.types';
import type { HistoryQueryDto } from './conversion.validators';

function ctx(req: Request): ConversionContext {
  return {
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

export const conversionController = {
  // POST /inr/quotes — create a short-lived INR↔USDT price quote.
  async quote(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = await conversionService.createQuote(
      user.id,
      { side: req.body.side, amount: req.body.amount },
      ctx(req),
    );
    sendSuccess(res, dto);
  },

  // POST /inr/conversions — execute a conversion against a valid quote.
  async convert(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = await conversionService.executeConversion(user.id, req.body.quoteId, ctx(req));
    sendSuccess(res, dto, 201);
  },

  // GET /inr/conversions — caller's conversion history.
  async history(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { side, cursor, limit } = req.query as unknown as HistoryQueryDto;
    const result = await conversionService.listHistory({ userId: user.id, side, cursor, limit });
    sendSuccess(res, result);
  },
};
