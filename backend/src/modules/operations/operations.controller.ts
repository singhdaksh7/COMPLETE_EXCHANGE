import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { operationsService } from './operations.service';
import type { AuditExportDto, AuditQueryDto } from './operations.validators';

export const operationsController = {
  // GET /operations/summary — real dashboard counts.
  async summary(_req: Request, res: Response): Promise<void> {
    const data = await operationsService.summary();
    sendSuccess(res, data);
  },

  // GET /operations/audit — paginated AdminLog viewer.
  async audit(req: Request, res: Response): Promise<void> {
    const q = req.query as unknown as AuditQueryDto;
    const result = await operationsService.listAudit({
      cursor: q.cursor,
      limit: q.limit,
      adminId: q.adminId,
      action: q.action,
      targetId: q.targetId,
      fromDate: q.fromDate,
      toDate: q.toDate,
    });
    sendSuccess(res, result);
  },

  // GET /operations/audit/export — CSV of the filtered audit set.
  async auditExport(req: Request, res: Response): Promise<void> {
    const q = req.query as unknown as AuditExportDto;
    const csv = await operationsService.exportAuditCsv({
      adminId: q.adminId,
      action: q.action,
      targetId: q.targetId,
      fromDate: q.fromDate,
      toDate: q.toDate,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admin-audit.csv"');
    res.status(200).send(csv);
  },
};
