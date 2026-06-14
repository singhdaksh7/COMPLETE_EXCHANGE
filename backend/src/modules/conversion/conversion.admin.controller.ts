import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { conversionService } from './conversion.service';
import type { ConversionContext } from './conversion.types';
import type { AdminConversionQueryDto } from './conversion.validators';

function ctx(req: Request): ConversionContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin conversion monitoring. Behind adminAuthenticate + adminAuthorize —
 * see conversion.admin.routes.ts. Reads are audited.
 */
export const adminConversionController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { side, userId, cursor, limit } = req.query as unknown as AdminConversionQueryDto;
    const result = await conversionService.adminList({ side, userId, cursor, limit }, ctx(req));
    sendSuccess(res, result);
  },
};
