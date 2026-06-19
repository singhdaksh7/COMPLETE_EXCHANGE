import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { reportsService } from './reports.service';
import type { FeeReportQueryDto } from './reports.validators';

export const reportsController = {
  async fees(req: Request, res: Response): Promise<void> {
    const q = req.query as unknown as FeeReportQueryDto;
    const data = await reportsService.feeReport({
      fromDate: q.fromDate,
      toDate: q.toDate,
    });
    sendSuccess(res, data);
  },
};
